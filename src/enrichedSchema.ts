/**
 * Column-documentation loader (vscode wrapper).
 *
 * Input-file docs come from the schema built from SWAT+ source
 * (`swatplus-generated-schema.json`): Tamandua's facts -- each column's
 * type, units and inline description, citing its declaration -- and nothing
 * written by a model. The build for this workspace replaces the shipped copy
 * via {@link EnrichedSchemaProvider.useInputSchema}. Output-file docs still come
 * from `swatplus-output-schema.json`, since Tamandua does not yet derive
 * output columns.
 *
 * All parsing and lookups are delegated to the vscode-free
 * {@link EnrichedSchemaIndex}. If a file is absent, accessors return
 * `undefined` and callers fall back to their existing behavior.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    EnrichedSchemaIndex,
    EnrichedSchemaFile,
    ColumnDoc,
    FileDoc,
    renderColumnDocLines,
    OutputSchemaIndex,
    OutputSchemaFile,
    OutputFileDoc,
    OutputColumnDoc,
} from './enrichedSchemaCore';

export {
    ColumnDoc, FileDoc, OutputFileDoc, OutputColumnDoc,
    columnDocTooltip, outputColumnDocTooltip,
} from './enrichedSchemaCore';

const INPUT_DOCS_FILENAME = 'swatplus-generated-schema.json';
const OUTPUT_FILENAME = 'swatplus-output-schema.json';

export class EnrichedSchemaProvider {
    private index: EnrichedSchemaIndex;
    private outputIndex: OutputSchemaIndex;

    constructor(private context: vscode.ExtensionContext) {
        this.index = new EnrichedSchemaIndex(
            this.loadData(INPUT_DOCS_FILENAME, 'input-file docs'));
        this.outputIndex = new OutputSchemaIndex(
            this.loadData(OUTPUT_FILENAME, 'output schema'));
    }

    /** Resolve a schema file: user schemaDirectories first, then the shipped copy. */
    private resolvePath(fileName: string): string | undefined {
        const config = vscode.workspace.getConfiguration('swatplus');
        const dirs = config.get<string[]>('schemaDirectories', []) || [];
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        for (const dir of dirs) {
            const resolved = workspaceFolder
                ? dir.replace('${workspaceFolder}', workspaceFolder)
                : dir;
            const candidate = path.join(resolved, fileName);
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
        const shipped = path.join(
            this.context.extensionPath, 'resources', 'schema', fileName);
        return fs.existsSync(shipped) ? shipped : undefined;
    }

    private loadData<T>(fileName: string, label: string): T | null {
        try {
            const filePath = this.resolvePath(fileName);
            if (!filePath) {
                return null;
            }
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            console.log(`Failed to load SWAT+ ${label}: ${error}`);
            return null;
        }
    }

    /** Take input-file docs from a schema just built for this workspace. */
    public useInputSchema(schemaPath: string): void {
        try {
            this.index = new EnrichedSchemaIndex(JSON.parse(fs.readFileSync(schemaPath, 'utf-8')));
        } catch (error) {
            console.log(`Failed to load input-file docs from ${schemaPath}: ${error}`);
        }
    }

    public isAvailable(): boolean {
        return this.index.isAvailable();
    }

    public getSwatplusVersion(): string | undefined {
        return this.index.getSwatplusVersion() ?? this.outputIndex.getSwatplusVersion();
    }

    public getFileDoc(fileName: string): FileDoc | undefined {
        return this.index.getFileDoc(fileName);
    }

    public getColumnDoc(fileName: string, columnName: string): ColumnDoc | undefined {
        return this.index.getColumnDoc(fileName, columnName);
    }

    // --- Output-file documentation ---

    public getOutputFileDoc(fileName: string): OutputFileDoc | undefined {
        return this.outputIndex.getFileDoc(fileName);
    }

    public getOutputColumnDoc(fileName: string, column: string): OutputColumnDoc | undefined {
        return this.outputIndex.getColumnDoc(fileName, column);
    }

    /** The underlying vscode-free input-schema index (for the dataset engine). */
    public get inputIndex(): EnrichedSchemaIndex {
        return this.index;
    }

    /** The underlying vscode-free output-schema index (for the dataset engine). */
    public get outputIndexRef(): OutputSchemaIndex {
        return this.outputIndex;
    }
}

/**
 * Append a column's documentation to a hover/markdown string, consistently with
 * other panels. Appends nothing when `doc` is undefined.
 */
export function appendColumnDoc(md: vscode.MarkdownString, doc: ColumnDoc | undefined): void {
    for (const line of renderColumnDocLines(doc)) {
        md.appendMarkdown(`${line}\n\n`);
    }
}

// Shared instance so webview panels (constructed from many call sites) can read
// enrichment without threading the provider through every signature. Set once at
// activation. The provider is read-only after load, so sharing is safe.
let sharedProvider: EnrichedSchemaProvider | undefined;

export function setSharedEnrichedSchema(provider: EnrichedSchemaProvider): void {
    sharedProvider = provider;
}

export function getSharedEnrichedSchema(): EnrichedSchemaProvider | undefined {
    return sharedProvider;
}
