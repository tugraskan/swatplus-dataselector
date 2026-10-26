// The subset options and the hru_processor.py arguments they map to. The tracked
// SWAT+ workarounds W1-W4 are described in scripts/SWAT_WORKAROUNDS.md at the
// repo root. No vscode import.

export interface SubsetOptions {
    /** `--keep-routing`: keep the downstream routing objects, not just the HRUs. */
    keepRouting: boolean;
    /** W1, on by CLI default; only applies with keepRouting. Off maps to `--exact-hrus`. */
    feederHrus: boolean;
    /** W2, on by CLI default. Off maps to `--keep-wetland-file`. */
    alignWetlands: boolean;
    /** W3, off by default: `--main-compat`. */
    mainCompat: boolean;
    /** W4, off by default: `--no-outputs`. */
    noOutputs: boolean;
}

/** The CLI's own defaults. */
export const DEFAULT_OPTIONS: Readonly<SubsetOptions> = {
    keepRouting: false,
    feederHrus: true,
    alignWetlands: true,
    mainCompat: false,
    noOutputs: false
};

export interface SubsetArgsInput {
    datasetPath: string;
    /** Compact id text such as "1,4-6,10". */
    hruIds: string;
    outputDir: string;
    options: SubsetOptions;
}

/**
 * hru_processor.py arguments for one subset, without the script path and
 * `--json`. `--output-dir` is always present, so the script never falls back to
 * writing inside the dataset, and `--overwrite` / `--run-swat` are never used.
 */
export function buildSubsetArgs(input: SubsetArgsInput): string[] {
    if (!input.outputDir.trim()) {
        throw new Error('An output folder is required.');
    }
    const { options } = input;
    const args = ['--dataset', input.datasetPath, '--hru-ids', input.hruIds, '--output-dir', input.outputDir];
    if (options.keepRouting) {
        args.push('--keep-routing');
        if (!options.feederHrus) {
            args.push('--exact-hrus');
        }
    }
    if (!options.alignWetlands) {
        args.push('--keep-wetland-file');
    }
    if (options.mainCompat) {
        args.push('--main-compat');
    }
    if (options.noOutputs) {
        args.push('--no-outputs');
    }
    return args;
}

export type OptionKey = keyof SubsetOptions;

export interface OptionChoice {
    key: OptionKey;
    label: string;
    description: string;
    detail: string;
}

/** The entries of the options quick pick; `DEFAULT_OPTIONS` decides which start ticked. */
export const OPTION_CHOICES: readonly OptionChoice[] = [
    {
        key: 'keepRouting',
        label: 'Keep downstream routing (connected)',
        description: '--keep-routing',
        detail: 'Trace and keep the routing units, channels, reservoirs and aquifers the HRUs flow into. Unticked: keep only the HRUs.'
    },
    {
        key: 'feederHrus',
        label: 'Add feeder HRUs',
        description: 'W1 · needs keep routing',
        detail: 'Add one HRU for each kept channel that would have only channel inflows, which crashes SWAT+ main/dev ch_temp. Unticked: --exact-hrus.'
    },
    {
        key: 'alignWetlands',
        label: 'Align wetland file',
        description: 'W2',
        detail: 'Move each wetland row of hydrology.wet to the number of the HRU that uses it. Unticked: --keep-wetland-file.'
    },
    {
        key: 'mainCompat',
        label: 'SWAT+ main/dev compatibility',
        description: 'W3 · --main-compat',
        detail: 'Water allocation off and print.prt rows that only NAM_Branch accepts removed.'
    },
    {
        key: 'noOutputs',
        label: 'Turn all outputs off',
        description: 'W4 · --no-outputs',
        detail: 'Set every print.prt object row to n, so the subset writes no output tables.'
    }
];

/** Options from the keys ticked in the quick pick. */
export function optionsFromPicked(picked: ReadonlySet<OptionKey>): SubsetOptions {
    return {
        keepRouting: picked.has('keepRouting'),
        feederHrus: picked.has('feederHrus'),
        alignWetlands: picked.has('alignWetlands'),
        mainCompat: picked.has('mainCompat'),
        noOutputs: picked.has('noOutputs')
    };
}
