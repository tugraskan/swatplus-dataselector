// The subset options and the hru_processor.py arguments they map to. The tracked
// SWAT+ workarounds W1-W4 are described in python/SWAT_WORKAROUNDS.md. No vscode
// import.

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

/** The flags that follow from the options, shared by a real run and a plan. */
function optionFlags(options: SubsetOptions): string[] {
    const flags: string[] = [];
    if (options.keepRouting) {
        flags.push('--keep-routing');
        if (!options.feederHrus) {
            flags.push('--exact-hrus');
        }
    }
    if (!options.alignWetlands) {
        flags.push('--keep-wetland-file');
    }
    if (options.mainCompat) {
        flags.push('--main-compat');
    }
    if (options.noOutputs) {
        flags.push('--no-outputs');
    }
    return flags;
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
    return [
        '--dataset', input.datasetPath,
        '--hru-ids', input.hruIds,
        '--output-dir', input.outputDir,
        ...optionFlags(input.options)
    ];
}

/**
 * Arguments for `--plan`: the same options as a real run, no output folder. The
 * script ignores `--output-dir` in this mode and never creates it, so it is not
 * passed at all.
 */
export function buildPlanArgs(input: Omit<SubsetArgsInput, 'outputDir'>): string[] {
    return [
        '--dataset', input.datasetPath,
        '--hru-ids', input.hruIds,
        '--plan',
        ...optionFlags(input.options)
    ];
}

export type OptionKey = keyof SubsetOptions;

export interface OptionChoice {
    key: OptionKey;
    /** Short name next to the control. */
    label: string;
    /** The workaround id, when there is one. */
    tag?: string;
    /** The command-line flag the option maps to. */
    flag: string;
    /** Whether the flag is passed when the option is on (`on`) or when it is off (`off`). */
    flagWhen: 'on' | 'off';
    /** One or two sentences of help under the control. */
    help: string;
}

/** The option controls of the panel, in display order. `DEFAULT_OPTIONS` decides which start on. */
export const OPTION_CHOICES: readonly OptionChoice[] = [
    {
        key: 'keepRouting',
        label: 'Keep routing',
        flag: '--keep-routing',
        flagWhen: 'on',
        help: 'Also keep the routing units, channels, reservoirs and aquifers the HRUs flow into. Off: only the HRUs.'
    },
    {
        key: 'feederHrus',
        label: 'Add feeder HRUs',
        tag: 'W1',
        flag: '--exact-hrus',
        flagWhen: 'off',
        help: 'Needs keep routing. Adds one HRU for each kept channel that would have only channel inflows, which stops SWAT+ main/dev (ch_temp). Off: only the HRUs you picked.'
    },
    {
        key: 'alignWetlands',
        label: 'Align wetland file',
        tag: 'W2',
        flag: '--keep-wetland-file',
        flagWhen: 'off',
        help: 'Moves each wetland row of hydrology.wet to the number of the HRU that uses it, because SWAT+ reads a per-HRU array at that row.'
    },
    {
        key: 'mainCompat',
        label: 'SWAT+ main/dev compatibility',
        tag: 'W3',
        flag: '--main-compat',
        flagWhen: 'on',
        help: 'Water allocation off and the print.prt rows only NAM_Branch accepts removed.'
    },
    {
        key: 'noOutputs',
        label: 'Turn all outputs off',
        tag: 'W4',
        flag: '--no-outputs',
        flagWhen: 'on',
        help: 'Sets every print.prt object row to n, so the subset writes no output tables.'
    }
];

/** Whether the option's control can be changed: feeder HRUs only apply while routing is kept. */
export function isOptionEnabled(key: OptionKey, options: SubsetOptions): boolean {
    return key !== 'feederHrus' || options.keepRouting;
}

/** Options read from stored or message data; anything that is not a boolean falls back to the default. */
export function sanitizeOptions(value: unknown): SubsetOptions {
    const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const pick = (key: OptionKey): boolean => (typeof source[key] === 'boolean' ? (source[key] as boolean) : DEFAULT_OPTIONS[key]);
    return {
        keepRouting: pick('keepRouting'),
        feederHrus: pick('feederHrus'),
        alignWetlands: pick('alignWetlands'),
        mainCompat: pick('mainCompat'),
        noOutputs: pick('noOutputs')
    };
}
