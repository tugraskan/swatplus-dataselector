// Options and result text for scripts/hru_processor.py, kept free of the vscode
// API so unit tests can load it.

/** One HRU the processor added to a keep-routing subset (workaround W1). */
export interface HruAddedFeeder {
    hru_id: number;
    reason: string;
    channel_id?: number;
    feeder_type?: string;
    feeder_id?: number;
}

/**
 * Switches for the tracked SWAT+ workarounds. Defaults match the CLI, so an
 * undefined flag means "leave the workaround as the CLI has it":
 * W1 and W2 on, W3 and W4 off. See scripts/SWAT_WORKAROUNDS.md.
 */
export interface HruSubsetFlags {
    /** W1 off: keep only the requested HRUs (keep-routing). Default false. */
    exactHrus?: boolean;
    /** W2 off: keep hydrology.wet as it is. Default false. */
    keepWetlandFile?: boolean;
    /** W3 on: make the subset run on SWAT+ main/dev. Default false. */
    mainCompat?: boolean;
    /** W4 on: switch every print.prt object row off. Default false. */
    noOutputs?: boolean;
}

export const WORKAROUND_LABELS: Record<string, string> = {
    W1: 'feeder HRUs',
    W2: 'align hydrology.wet',
    W3: 'main/dev compatibility',
    W4: 'all outputs off'
};

export interface HruSubsetArgsInput extends HruSubsetFlags {
    datasetPath: string;
    hruIds: string;
    keepRouting: boolean;
    runSwat: boolean;
    executablePath?: string;
}

/** The hru_processor.py arguments (without the script path and `--json`). */
export function buildHruProcessorArgs(options: HruSubsetArgsInput): string[] {
    const args = ['--dataset', options.datasetPath, '--hru-ids', options.hruIds];

    if (options.keepRouting) {
        args.push('--keep-routing');
        // Feeder HRUs only apply while keeping routing.
        if (options.exactHrus) {
            args.push('--exact-hrus');
        }
    }
    if (options.keepWetlandFile) {
        args.push('--keep-wetland-file');
    }
    if (options.mainCompat) {
        args.push('--main-compat');
    }
    if (options.noOutputs) {
        args.push('--no-outputs');
    }
    if (options.runSwat) {
        args.push('--run-swat');
    }
    if (options.executablePath) {
        args.push('--exe', options.executablePath);
    }
    return args;
}

export interface HruSubsetReport {
    added_hru_ids?: HruAddedFeeder[];
    workarounds_applied?: string[];
}

/** Lines for the HRU processor output channel. Empty when nothing was added or applied. */
export function describeHruSubsetWorkarounds(result: HruSubsetReport): string[] {
    const lines: string[] = [];
    for (const added of result.added_hru_ids ?? []) {
        lines.push(`Added feeder HRU ${added.hru_id}: ${added.reason}`);
    }
    const applied = result.workarounds_applied ?? [];
    if (applied.length > 0) {
        const labelled = applied.map(id => (WORKAROUND_LABELS[id] ? `${id} (${WORKAROUND_LABELS[id]})` : id));
        lines.push(`Workarounds applied: ${labelled.join(', ')}. See scripts/SWAT_WORKAROUNDS.md.`);
    }
    return lines;
}

/** Short sentence for the result notification; empty when nothing was added or applied. */
export function summarizeHruSubsetWorkarounds(result: HruSubsetReport): string {
    const parts: string[] = [];
    const added = (result.added_hru_ids ?? []).map(item => item.hru_id);
    if (added.length > 0) {
        parts.push(`Added feeder HRU${added.length === 1 ? '' : 's'} ${added.join(', ')}.`);
    }
    const applied = result.workarounds_applied ?? [];
    if (applied.length > 0) {
        parts.push(`Workarounds: ${applied.join(', ')}.`);
    }
    return parts.join(' ');
}
