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
    warnings?: string[];
    error?: string;
}

/** `--plan --json`: what a run would do, nothing written. Same shape as a result, without an output folder. */
export interface PlanResult {
    ok: boolean;
    plan: true;
    source_dir: string;
    hru_ids: number[];
    keep_routing: boolean;
    options?: SubsetResult['options'];
    retained_counts?: Record<string, number>;
    added_hru_ids?: AddedHru[];
    workarounds_applied?: string[];
    warnings?: string[];
    error?: string;
}

/** One row of `--hru-table --json`. Anything the dataset does not have is null. */
export interface HruTableRow {
    id: number;
    name: string | null;
    landuse: string | null;
    landuse_group: string | null;
    plant_community: string | null;
    management: string | null;
    area_ha: number | null;
    subbasin: string | null;
    routing_unit: string | null;
    wetland: boolean;
    wetland_name: string | null;
    receives_upstream: boolean;
}

/** `--hru-table --json` */
export interface HruTable {
    ok: boolean;
    source_dir: string;
    total_hrus: number;
    rows: HruTableRow[];
    subbasin_rule: string;
    subbasin_sources: Record<string, number>;
    warnings: string[];
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

/** The line under the dataset box: "HRUs 1–4222 (4222 total)". */
export function formatRangeLine(range: Pick<HruRange, 'min_hru' | 'max_hru' | 'total_hrus'>): string {
    return `HRUs ${range.min_hru}–${range.max_hru} (${range.total_hrus} total)`;
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

export interface AddedHruView {
    hruId: number;
    reason: string;
}

/** What the panel shows for a plan or a finished run. Plain strings; the webview only places them. */
export interface SummaryView {
    /** One sentence, e.g. "Will keep 7 HRUs (4 feeder HRUs added)". */
    headline: string;
    /** "3 picked" or "3 picked + 4 feeder". */
    requested: string;
    /** "7 HRUs, 7 routing units, ..." */
    kept: string;
    added: AddedHruView[];
    /** "W1 (feeder HRUs added)" ... */
    workarounds: string[];
    warnings: string[];
}

export interface ResultView extends SummaryView {
    outputDir: string;
    sourceDir: string;
}

function workaroundLabels(applied: readonly string[] | undefined): string[] {
    return (applied ?? []).map(id => (WORKAROUND_LABELS[id] ? `${id} (${WORKAROUND_LABELS[id]})` : id));
}

function pluralHrus(count: number): string {
    return `${count} HRU${count === 1 ? '' : 's'}`;
}

function summaryOf(
    source: Pick<SubsetResult, 'hru_ids' | 'retained_counts' | 'added_hru_ids' | 'workarounds_applied' | 'warnings'>,
    verb: string
): SummaryView {
    const added = source.added_hru_ids ?? [];
    const kept = source.retained_counts?.['hru'] ?? source.hru_ids.length + added.length;
    return {
        headline: `${verb} ${pluralHrus(kept)}` + (added.length > 0 ? ` (${added.length} feeder HRU${added.length === 1 ? '' : 's'} added)` : ''),
        requested: `${source.hru_ids.length} picked` + (added.length > 0 ? ` + ${added.length} feeder` : ''),
        kept: formatRetainedCounts(source.retained_counts),
        added: added.map(item => ({ hruId: item.hru_id, reason: item.reason })),
        workarounds: workaroundLabels(source.workarounds_applied),
        warnings: [...(source.warnings ?? [])]
    };
}

/** The preview under the HRU IDs: what a run with these settings would keep and add. */
export function describePlan(plan: PlanResult): SummaryView {
    return summaryOf(plan, 'Will keep');
}

/** The results area after a run. */
export function describeResult(result: SubsetResult): ResultView {
    return { ...summaryOf(result, 'Created a subset with'), outputDir: result.output_dir, sourceDir: result.source_dir };
}
