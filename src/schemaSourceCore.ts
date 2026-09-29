/**
 * Pure (vscode-free) logic for building the schema from SWAT+ source.
 *
 * The schema is generated from Tamandua's input-file layouts -- what SWAT+
 * reads from each file, in order, derived from the Fortran -- merged with real
 * header lines and the editor schema's links by
 * `scripts/generate_schema_from_layouts.py`. This module decides where the
 * layouts come from and what to call the result; `schemaBuilder.ts` runs it.
 *
 * Where the layouts come from, best first:
 *   1. `source`   -- the SWAT+ checkout in this workspace (or the configured
 *                    one), via `swatplus-build` + `swatplus-layouts`. Needs
 *                    Tamandua and its parser.
 *   2. `tamandua` -- the snapshot bundled with the installed Tamandua, via
 *                    `swatplus-layouts`. Needs Tamandua only.
 *   3. `shipped`  -- `resources/schema/swatplus-layouts.json`, built from SWAT+
 *                    62.0.0 when this extension was packaged. Needs nothing.
 * A schema the user picks, uploads or edits always wins over all three.
 */

import * as fs from 'fs';
import * as path from 'path';

export type LayoutTier = 'source' | 'tamandua' | 'shipped';

export interface CommandSpec {
    command: string;
    args: string[];
}

const FORTRAN_SUFFIXES = new Set(['.f90', '.f', '.for', '.f95']);

function containsFortran(dir: string): boolean {
    try {
        return fs.readdirSync(dir).some(name => FORTRAN_SUFFIXES.has(path.extname(name).toLowerCase()));
    } catch {
        return false;
    }
}

/** A SWAT+ checkout or its `src/` directory -- the same test Tamandua applies. */
export function looksLikeSwatplusSource(dir: string | undefined): boolean {
    if (!dir) {
        return false;
    }
    return containsFortran(dir) || containsFortran(path.join(dir, 'src'));
}

/**
 * The SWAT+ source to build from: the configured directory when set (and
 * valid), else the first workspace folder that is a SWAT+ checkout.
 */
export function findSourceDirectory(
    configured: string | undefined,
    workspaceFolders: string[],
): string | undefined {
    const workspace = workspaceFolders[0];
    const explicit = (configured || '').trim();
    if (explicit) {
        const resolved = workspace ? explicit.replace(/\$\{workspaceFolder\}/g, workspace) : explicit;
        const absolute = path.normalize(
            path.isAbsolute(resolved) || !workspace ? resolved : path.join(workspace, resolved));
        return looksLikeSwatplusSource(absolute) ? absolute : undefined;
    }
    return workspaceFolders.find(folder => looksLikeSwatplusSource(folder));
}

/**
 * Datasets whose header lines name the columns, best first: the selected
 * dataset (it is what the user's files say), then the example datasets the
 * SWAT+ checkout carries under `refdata/`.
 */
export function headerReferenceDirs(datasetDir: string | undefined, sourceDir: string | undefined): string[] {
    const dirs: string[] = [];
    if (datasetDir && fs.existsSync(datasetDir)) {
        dirs.push(datasetDir);
    }
    if (sourceDir) {
        const refdata = [path.join(sourceDir, 'refdata'), path.join(sourceDir, '..', 'refdata')]
            .find(candidate => fs.existsSync(candidate));
        if (refdata) {
            try {
                const examples = fs.readdirSync(refdata)
                    .map(name => path.join(refdata, name))
                    .filter(dir => fs.existsSync(path.join(dir, 'file.cio')))
                    .sort((a, b) => a.localeCompare(b));
                dirs.push(...examples);
            } catch {
                // An unreadable refdata folder just means fewer header references.
            }
        }
    }
    return Array.from(new Set(dirs));
}

/** Python executables to try, the same order the indexer uses. */
export function pythonCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
    const candidates: string[] = [];
    if (env.SWATPLUS_PYTHON) {
        candidates.push(env.SWATPLUS_PYTHON);
    }
    candidates.push(...(platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']));
    return Array.from(new Set(candidates));
}

/**
 * Whether a failed attempt means "this way of running it is not available"
 * (try the next candidate) rather than "it ran and failed" (report it).
 */
export function isUnavailable(outcome: { error?: Error; stderr: string }): boolean {
    if (outcome.error) {
        return true;
    }
    return /No module named ['"]?tamandua/.test(outcome.stderr);
}

/**
 * Ways to run a Tamandua command: its console script first, then the module
 * through each Python, since the scripts directory is often not on PATH
 * (notably on Windows).
 */
export function tamanduaCommands(
    tool: 'swatplus-build' | 'swatplus-layouts',
    args: string[],
    pythons: string[],
): CommandSpec[] {
    const module = tool === 'swatplus-build' ? 'tamandua.index.cli' : 'tamandua.index.layouts_cli';
    return [
        { command: tool, args },
        ...pythons.map(python => ({ command: python, args: ['-m', module, ...args] })),
    ];
}

/** What a generated schema was built from, for the sidebar and status bar. */
export interface GeneratedSchemaOrigin {
    tier?: LayoutTier;
    swatplus?: string;
    commit?: string;
    headerReferences: string[];
}

export function readGeneratedSchemaOrigin(schema: any, tier?: LayoutTier): GeneratedSchemaOrigin | undefined {
    const generated = schema?.generated_from;
    if (!generated) {
        return undefined;
    }
    return {
        tier,
        swatplus: generated.swatplus?.describe ?? undefined,
        commit: generated.swatplus?.commit ?? undefined,
        headerReferences: Array.isArray(generated.header_references) ? generated.header_references : [],
    };
}

/** "SWAT+ 62.0.0 (de210d6), shipped" -- short enough for a dropdown. */
export function describeGeneratedSchema(origin: GeneratedSchemaOrigin | undefined): string {
    if (!origin) {
        return 'Built from SWAT+ source';
    }
    const version = origin.swatplus && !/^[0-9a-f]{7,40}$/i.test(origin.swatplus)
        ? origin.swatplus
        : undefined;
    const commit = origin.commit ? origin.commit.slice(0, 7) : undefined;
    const release = version && commit ? `${version} (${commit})` : version ?? commit ?? 'unknown';
    const where = origin.tier === 'source'
        ? 'from your source'
        : origin.tier === 'tamandua'
            ? 'Tamandua snapshot'
            : 'shipped';
    return `SWAT+ ${release}, ${where}`;
}

/**
 * Whether a JSON file is a schema the picker should offer. Documentation-only
 * files (the enriched and output schemas carry an `enrichment` block) have
 * `schema_version` and `tables` too, but indexing with one fails: 84 of the
 * enriched schema's tables have no `table_name`. (The generated schemas are
 * offered once, as the automatic option, by path -- a saved copy of one is an
 * ordinary custom schema.)
 */
export function isSelectableSchema(data: any): boolean {
    return Boolean(data && data.schema_version && data.tables && !data.enrichment);
}
