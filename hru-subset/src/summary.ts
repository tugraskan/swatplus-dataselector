// Types for the script's JSON and the text shown after a run. No vscode import.

import { formatHruIds } from './ids';

/** `--hru-range --json` */
export interface HruRange {
    ok: boolean;
    source_dir: string;
    min_hru: number;
    max_hru: number;
    total_hrus: number;
    error?: string;
}

/** One HRU the script added to a keep-routing subset (workaround W1). */
export interface AddedHru {
    hru_id: number;
    reason: string;
    channel_id?: number;
    feeder_type?: string;
    feeder_id?: number;
}

/** The success JSON of a subset run; only the fields this extension reads. */
export interface SubsetResult {
    ok: boolean;
    source_dir: string;
    output_dir: string;
    hru_ids: number[];
    keep_routing: boolean;
    options?: {
        exact_hrus?: boolean;
        keep_wetland_file?: boolean;
        main_compat?: boolean;
        no_outputs?: boolean;
    };
    retained_counts?: Record<string, number>;
    added_hru_ids?: AddedHru[];
    workarounds_applied?: string[];
    error?: string;
}

export const WORKAROUND_LABELS: Record<string, string> = {
    W1: 'feeder HRUs added',
    W2: 'wetland file aligned',
    W3: 'main/dev compatibility',
    W4: 'all outputs off'
};

const COUNT_LABELS: Record<string, string> = {
    hru: 'HRUs',
    ru: 'routing units',
    cha: 'channels',
    sdc: 'channels (SWAT-DEG)',
    aqu: 'aquifers',
    res: 'reservoirs',
    rec: 'recalls',
    exc: 'export coefficients',
    dr: 'delivery ratios',
    out: 'outlets'
};

export function formatRange(range: Pick<HruRange, 'min_hru' | 'max_hru' | 'total_hrus'>): string {
    return `${range.total_hrus} HRUs (${range.min_hru}–${range.max_hru})`;
}

/** "7 HRUs, 7 routing units, 439 channels (SWAT-DEG), ..." in the script's order. */
export function formatRetainedCounts(counts: Record<string, number> | undefined): string {
    const entries = Object.entries(counts ?? {}).filter(([, value]) => value > 0);
    if (entries.length === 0) {
        return 'nothing reported';
    }
    return entries.map(([key, value]) => `${value} ${COUNT_LABELS[key] ?? key}`).join(', ');
}

/** What the run did, one line each, for the log and the result dialog. */
export function formatSummaryLines(result: SubsetResult): string[] {
    const lines: string[] = [];
    lines.push(`Output: ${result.output_dir}`);
    lines.push(`Dataset: ${result.source_dir}`);
    lines.push(`Requested HRUs: ${formatHruIds(result.hru_ids)} (${result.hru_ids.length})`);
    lines.push(`Routing: ${result.keep_routing ? 'downstream routing kept' : 'HRUs only'}`);
    lines.push(`Kept: ${formatRetainedCounts(result.retained_counts)}`);

    const added = result.added_hru_ids ?? [];
    if (added.length > 0) {
        lines.push(`Added feeder HRUs (${added.length}), W1:`);
        for (const item of added) {
            lines.push(`  HRU ${item.hru_id}: ${item.reason}`);
        }
    }

    const applied = result.workarounds_applied ?? [];
    if (applied.length > 0) {
        const labelled = applied.map(id => (WORKAROUND_LABELS[id] ? `${id} (${WORKAROUND_LABELS[id]})` : id));
        lines.push(`Workarounds applied: ${labelled.join(', ')}`);
    } else {
        lines.push('Workarounds applied: none');
    }
    return lines;
}

/** One-line headline, e.g. "Subset created: 7 HRUs, 7 routing units (+4 feeder HRUs)". */
export function formatHeadline(result: SubsetResult): string {
    const kept = result.retained_counts?.['hru'] ?? result.hru_ids.length;
    const added = result.added_hru_ids?.length ?? 0;
    return `Subset created with ${kept} HRU${kept === 1 ? '' : 's'}`
        + (added > 0 ? ` (${added} feeder HRU${added === 1 ? '' : 's'} added)` : '');
}
