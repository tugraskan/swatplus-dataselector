/**
 * Builds the dataselector schema from SWAT+ source (vscode wrapper).
 *
 * Runs Tamandua to get the input-file layouts of the SWAT+ tree in this
 * workspace, then `scripts/generate_schema_from_layouts.py` to turn them into
 * the schema the indexer reads. Falls back to Tamandua's bundled snapshot,
 * then to the layouts shipped with the extension; see `schemaSourceCore.ts`
 * for the order and why. Rebuilds when the Fortran changes.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import {
    CommandSpec,
    GeneratedSchemaOrigin,
    LayoutTier,
    findSourceDirectory,
    headerReferenceDirs,
    isUnavailable,
    pythonCandidates,
    readGeneratedSchemaOrigin,
    tamanduaCommands,
} from './schemaSourceCore';

export interface GeneratedSchemaResult {
    /** The schema file to index with. */
    path: string;
    tier: LayoutTier;
    origin?: GeneratedSchemaOrigin;
    sourceDir?: string;
    /** Why a better tier was not used, in plain words. */
    notes: string[];
}

interface Outcome {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
}

const TIMEOUT_MS = 180_000;

function run(spec: CommandSpec): Promise<Outcome> {
    return new Promise(resolve => {
        let stdout = '';
        let stderr = '';
        let settled = false;
        const finish = (outcome: Outcome): void => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(outcome);
            }
        };
        let child: ReturnType<typeof spawn>;
        try {
            child = spawn(spec.command, spec.args, { windowsHide: true });
        } catch (error) {
            resolve({ status: null, stdout, stderr, error: error as Error });
            return;
        }
        const timer = setTimeout(() => {
            child.kill();
            finish({ status: null, stdout, stderr: `${stderr}\ntimed out after ${TIMEOUT_MS / 1000}s` });
        }, TIMEOUT_MS);
        child.stdout?.on('data', chunk => { stdout += String(chunk); });
        child.stderr?.on('data', chunk => { stderr += String(chunk); });
        child.on('error', error => finish({ status: null, stdout, stderr, error }));
        child.on('close', status => finish({ status, stdout, stderr }));
    });
}

export class GeneratedSchemaBuilder implements vscode.Disposable {
    private readonly output: vscode.OutputChannel;
    private readonly changed = new vscode.EventEmitter<GeneratedSchemaResult>();
    public readonly onDidBuild = this.changed.event;
    private queue: Promise<unknown> = Promise.resolve();
    private watcher: vscode.FileSystemWatcher | undefined;
    private watchedSource: string | undefined;
    private debounce: NodeJS.Timeout | undefined;
    private lastDataset: string | undefined;
    private last: GeneratedSchemaResult | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.output = vscode.window.createOutputChannel('SWAT+ Schema');
        context.subscriptions.push(this.output, this.changed, this);
    }

    public get lastResult(): GeneratedSchemaResult | undefined {
        return this.last;
    }

    public showOutput(): void {
        this.output.show(true);
    }

    private log(message: string): void {
        this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    private shipped(name: string): string {
        return path.join(this.context.extensionPath, 'resources', 'schema', name);
    }

    /** The schema the extension ships, built from SWAT+ 62.0.0. */
    public get shippedSchemaPath(): string {
        return this.shipped('swatplus-generated-schema.json');
    }

    private get storage(): string {
        return path.join(this.context.globalStorageUri.fsPath, 'generated-schema');
    }

    /** Where a successful build writes the schema. */
    public get generatedSchemaPath(): string {
        return path.join(this.storage, 'swatplus-generated-schema.json');
    }

    public get reportPath(): string {
        return path.join(this.storage, 'generated-schema-report.md');
    }

    private get enabled(): boolean {
        return vscode.workspace.getConfiguration('swatplus').get<boolean>('schemaFromSource', true);
    }

    public sourceDirectory(): string | undefined {
        const configured = vscode.workspace.getConfiguration('swatplus').get<string>('sourceDirectory', '');
        const folders = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
        return findSourceDirectory(configured, folders);
    }

    /** Run the first available candidate; stop at the first real failure. */
    private async runFirst(label: string, candidates: CommandSpec[]): Promise<Outcome & { ran?: string }> {
        let last: Outcome = { status: null, stdout: '', stderr: '', error: new Error('no candidates') };
        for (const spec of candidates) {
            const outcome = await run(spec);
            if (!isUnavailable(outcome)) {
                const ran = [spec.command, ...spec.args].join(' ');
                this.log(`${label}: ${ran} -> exit ${outcome.status}`);
                if (outcome.status !== 0 && outcome.stderr.trim()) {
                    this.log(outcome.stderr.trim());
                }
                return { ...outcome, ran };
            }
            last = outcome;
        }
        this.log(`${label}: not available (${last.error?.message || last.stderr.trim() || 'not found'})`);
        return last;
    }

    /**
     * Build (or rebuild) the schema. ``datasetDir`` is the selected dataset's
     * TxtInOut folder: its header lines name the columns first. Builds are
     * serialised, so a watcher-triggered rebuild never races an index build.
     */
    public build(datasetDir?: string): Promise<GeneratedSchemaResult> {
        if (datasetDir) {
            this.lastDataset = datasetDir;
        }
        const next = this.queue.then(() => this.buildNow(datasetDir ?? this.lastDataset));
        this.queue = next.catch(() => undefined);
        return next;
    }

    private async buildNow(datasetDir: string | undefined): Promise<GeneratedSchemaResult> {
        const notes: string[] = [];
        const pythons = pythonCandidates(process.env, process.platform);
        fs.mkdirSync(this.storage, { recursive: true });

        if (!this.enabled) {
            return this.finish({ path: this.shippedSchemaPath, tier: 'shipped', notes: [
                'swatplus.schemaFromSource is off; using the schema shipped with the extension.'] });
        }

        const sourceDir = this.sourceDirectory();
        this.watch(sourceDir);
        const layoutsOut = path.join(this.storage, 'swatplus-layouts.json');
        let layouts: string | undefined;
        let tier: LayoutTier = 'shipped';

        if (sourceDir) {
            const facts = path.join(this.storage, 'facts',
                crypto.createHash('sha1').update(sourceDir).digest('hex').slice(0, 12),
                'swatplus-facts.json');
            fs.mkdirSync(path.dirname(facts), { recursive: true });
            // A no-op in milliseconds when the facts already match the tree.
            const built = await this.runFirst('facts', tamanduaCommands('swatplus-build',
                ['--source', sourceDir, '--facts', facts, '--no-rhs', '--quiet'], pythons));
            if (built.status === 0) {
                const listed = await this.runFirst('layouts', tamanduaCommands('swatplus-layouts',
                    ['--facts', facts, '--out', layoutsOut], pythons));
                if (listed.status === 0) {
                    layouts = layoutsOut;
                    tier = 'source';
                } else {
                    notes.push('Tamandua could not list layouts from your source; see the SWAT+ Schema output.');
                }
            } else if (built.error || !built.ran) {
                notes.push('Tamandua is not installed, so the schema cannot follow your SWAT+ source. '
                    + 'Run "SWAT+: Set Up This Workspace" to install it.');
            } else if (/swatplus-reference-corpus|swatplus_reference/.test(built.stderr)) {
                notes.push('Tamandua\'s parser (swatplus-reference-corpus) is not installed, so the '
                    + 'schema cannot follow your SWAT+ source. "SWAT+: Set Up This Workspace" installs it.');
            } else {
                notes.push('Tamandua could not read your SWAT+ source; see the SWAT+ Schema output.');
            }
        }

        if (!layouts) {
            const bundled = await this.runFirst('layouts (bundled)', tamanduaCommands('swatplus-layouts',
                ['--out', layoutsOut], pythons));
            if (bundled.status === 0) {
                layouts = layoutsOut;
                tier = 'tamandua';
            }
        }
        if (!layouts) {
            layouts = this.shipped('swatplus-layouts.json');
            tier = 'shipped';
        }

        const script = path.join(this.context.extensionPath, 'scripts', 'generate_schema_from_layouts.py');
        const partial = `${this.generatedSchemaPath}.partial`;
        const args = [
            script,
            '--layouts', layouts,
            '--editor-schema', this.shipped('swatplus-editor-schema.json'),
            '--metadata', this.shipped('txtinout-metadata.json'),
            '--names', this.shipped('swatplus-learned-names.json'),
            ...headerReferenceDirs(datasetDir, sourceDir).flatMap(dir => ['--headers', dir]),
            '--out', partial,
            '--report', this.reportPath,
        ];
        const generated = await this.runFirst('schema', pythons.map(python => ({ command: python, args })));
        if (generated.status !== 0 || !fs.existsSync(partial)) {
            notes.push('Python could not generate the schema; using the one shipped with the extension.');
            return this.finish({ path: this.shippedSchemaPath, tier: 'shipped', sourceDir, notes });
        }
        fs.renameSync(partial, this.generatedSchemaPath);
        return this.finish({ path: this.generatedSchemaPath, tier, sourceDir, notes });
    }

    private finish(result: GeneratedSchemaResult): GeneratedSchemaResult {
        try {
            const schema = JSON.parse(fs.readFileSync(result.path, 'utf-8'));
            result.origin = readGeneratedSchemaOrigin(schema, result.tier);
        } catch (error) {
            this.log(`could not read ${result.path}: ${error}`);
        }
        for (const note of result.notes) {
            this.log(note);
        }
        this.log(`schema: ${result.path} (${result.tier})`);
        this.last = result;
        this.changed.fire(result);
        return result;
    }

    /** Rebuild when the Fortran in the source tree changes (edits, checkouts). */
    private watch(sourceDir: string | undefined): void {
        if (sourceDir === this.watchedSource) {
            return;
        }
        this.watcher?.dispose();
        this.watcher = undefined;
        this.watchedSource = sourceDir;
        if (!sourceDir) {
            return;
        }
        const pattern = new vscode.RelativePattern(sourceDir, '**/*.{f90,F90,f,for,f95}');
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const schedule = (): void => {
            if (this.debounce) {
                clearTimeout(this.debounce);
            }
            this.debounce = setTimeout(() => {
                this.log('SWAT+ source changed; rebuilding the schema');
                void this.build();
            }, 3000);
        };
        this.watcher.onDidChange(schedule);
        this.watcher.onDidCreate(schedule);
        this.watcher.onDidDelete(schedule);
    }

    public dispose(): void {
        if (this.debounce) {
            clearTimeout(this.debounce);
        }
        this.watcher?.dispose();
    }
}
