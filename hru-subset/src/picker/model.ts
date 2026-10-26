// The HRU picker's table logic: columns, filtering, sorting and selecting. Plain
// functions over arrays and Sets, so the tests need no browser and the picker
// webview just calls them. No vscode or DOM import.

import { expandHruIds, formatHruIds, validateHruIdText } from '../ids';
import type { HruTableRow } from '../summary';

export type ColumnKey =
    | 'id'
    | 'name'
    | 'landuse'
    | 'landuse_group'
    | 'plant_community'
    | 'management'
    | 'area_ha'
    | 'subbasin'
    | 'routing_unit'
    | 'wetland'
    | 'receives_upstream';

export interface ColumnDef {
    key: ColumnKey;
    title: string;
    /** Longer text for the header tooltip. */
    hint: string;
    /** Width in CSS pixels. */
    width: number;
    align: 'left' | 'right' | 'center';
}

export const COLUMNS: readonly ColumnDef[] = [
    { key: 'id', title: 'HRU', hint: 'HRU number (hru.con ID)', width: 64, align: 'right' },
    { key: 'name', title: 'Name', hint: 'hru.con NAME', width: 84, align: 'left' },
    { key: 'landuse', title: 'Land use', hint: 'landuse.lum name (hru-data.hru LU_MGT)', width: 92, align: 'left' },
    { key: 'landuse_group', title: 'Group', hint: 'landuse.lum CAL_GRP', width: 100, align: 'left' },
    { key: 'plant_community', title: 'Plant community', hint: 'landuse.lum PLNT_COM', width: 120, align: 'left' },
    { key: 'management', title: 'Management', hint: 'landuse.lum MGT', width: 210, align: 'left' },
    { key: 'area_ha', title: 'Area (ha)', hint: 'hru.con AREA', width: 84, align: 'right' },
    { key: 'subbasin', title: 'Subbasin', hint: 'From ls_unit.def, else the routing unit name, else the weather station', width: 118, align: 'left' },
    { key: 'routing_unit', title: 'Routing unit', hint: 'rout_unit.def unit that lists the HRU (through rout_unit.ele)', width: 150, align: 'left' },
    { key: 'wetland', title: 'Wetland', hint: 'hru-data.hru SURF_STOR is not null', width: 70, align: 'center' },
    { key: 'receives_upstream', title: 'Upstream', hint: 'Some connect file routes water to this HRU', width: 74, align: 'center' }
];

/** The text shown in a cell. Missing values are "-"; yes/no columns are "yes" or empty. */
export function cellText(row: HruTableRow, key: ColumnKey): string {
    switch (key) {
        case 'wetland':
            return row.wetland ? 'yes' : '';
        case 'receives_upstream':
            return row.receives_upstream ? 'yes' : '';
        case 'id':
            return String(row.id);
        case 'area_ha':
            return row.area_ha === null || row.area_ha === undefined
                ? '-'
                : row.area_ha.toLocaleString('en-US', { maximumFractionDigits: 3 });
        default: {
            const value = row[key];
            return value === null || value === undefined || value === '' ? '-' : String(value);
        }
    }
}

/** Lower-case text a filter is matched against: every cell, plus "wetland" and "upstream" for the yes columns. */
export function searchText(row: HruTableRow): string {
    return [
        row.id,
        row.name,
        row.landuse,
        row.landuse_group,
        row.plant_community,
        row.management,
        row.subbasin,
        row.routing_unit,
        row.wetland_name,
        row.wetland ? 'wetland' : '',
        row.receives_upstream ? 'upstream' : ''
    ].filter(value => value !== null && value !== undefined && value !== '').join(' ').toLowerCase();
}

/** A row table with its search text computed once, so each keystroke of the filter is a string scan. */
export interface IndexedRow {
    row: HruTableRow;
    text: string;
}

export function indexRows(rows: readonly HruTableRow[]): IndexedRow[] {
    return rows.map(row => ({ row, text: searchText(row) }));
}

/** Rows whose text contains every space-separated word of `query` (case-insensitive). Empty query: all rows. */
export function filterRows(indexed: readonly IndexedRow[], query: string): IndexedRow[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return indexed.slice();
    }
    return indexed.filter(item => words.every(word => item.text.includes(word)));
}

export interface SortState {
    key: ColumnKey;
    direction: 'asc' | 'desc';
}

/** Click on a header: ascending, then descending, then the file order again. */
export function nextSort(current: SortState | undefined, key: ColumnKey): SortState | undefined {
    if (!current || current.key !== key) {
        return { key, direction: 'asc' };
    }
    return current.direction === 'asc' ? { key, direction: 'desc' } : undefined;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function sortValue(row: HruTableRow, key: ColumnKey): number | string | boolean | null {
    switch (key) {
        case 'id':
            return row.id;
        case 'area_ha':
            return row.area_ha ?? null;
        case 'wetland':
            return row.wetland;
        case 'receives_upstream':
            return row.receives_upstream;
        default: {
            const value = row[key];
            return value === undefined || value === '' ? null : value;
        }
    }
}

/**
 * A sorted copy. Numbers compare as numbers, text with digits in natural order
 * (ru2 before ru10), yes before no when descending is not asked for. Missing
 * values go last in either direction, and ties keep their file order.
 */
export function sortRows(indexed: readonly IndexedRow[], sort: SortState | undefined): IndexedRow[] {
    const copy = indexed.slice();
    if (!sort) {
        return copy;
    }
    const sign = sort.direction === 'asc' ? 1 : -1;
    const decorated = copy.map((item, position) => ({ item, position, value: sortValue(item.row, sort.key) }));
    decorated.sort((a, b) => {
        const aNull = a.value === null;
        const bNull = b.value === null;
        if (aNull || bNull) {
            return aNull && bNull ? a.position - b.position : aNull ? 1 : -1;
        }
        let order: number;
        if (typeof a.value === 'number' && typeof b.value === 'number') {
            order = a.value - b.value;
        } else if (typeof a.value === 'boolean' && typeof b.value === 'boolean') {
            // "yes" first when ascending.
            order = Number(b.value) - Number(a.value);
        } else {
            order = collator.compare(String(a.value), String(b.value));
        }
        return order !== 0 ? sign * order : a.position - b.position;
    });
    return decorated.map(entry => entry.item);
}

// ---- selection ---------------------------------------------------------------------

export interface SelectionState {
    selected: ReadonlySet<number>;
    /** The row a shift-click extends from. */
    anchor?: number;
    /** The row last clicked; the group buttons act on its routing unit and subbasin. */
    focus?: number;
}

export const EMPTY_SELECTION: SelectionState = { selected: new Set() };

export interface ClickModifiers {
    ctrl: boolean;
    shift: boolean;
}

/**
 * A click on the row with id `clicked`, among the rows currently shown in
 * `visibleIds` (their order is the order on screen).
 *  - plain click: only that row;
 *  - ctrl/cmd: toggles that row;
 *  - shift: the rows from the anchor to that row, replacing the selection
 *    (ctrl+shift adds them to it).
 */
export function clickRow(
    state: SelectionState,
    visibleIds: readonly number[],
    clicked: number,
    modifiers: ClickModifiers
): SelectionState {
    if (modifiers.shift) {
        const anchorAt = state.anchor === undefined ? -1 : visibleIds.indexOf(state.anchor);
        const clickedAt = visibleIds.indexOf(clicked);
        if (clickedAt >= 0) {
            const from = anchorAt >= 0 ? Math.min(anchorAt, clickedAt) : clickedAt;
            const to = anchorAt >= 0 ? Math.max(anchorAt, clickedAt) : clickedAt;
            const range = visibleIds.slice(from, to + 1);
            const selected = new Set(modifiers.ctrl ? state.selected : []);
            for (const id of range) {
                selected.add(id);
            }
            return { selected, anchor: anchorAt >= 0 ? state.anchor : clicked, focus: clicked };
        }
    }
    if (modifiers.ctrl) {
        const selected = new Set(state.selected);
        if (selected.has(clicked)) {
            selected.delete(clicked);
        } else {
            selected.add(clicked);
        }
        return { selected, anchor: clicked, focus: clicked };
    }
    return { selected: new Set([clicked]), anchor: clicked, focus: clicked };
}

export function selectIds(state: SelectionState, ids: Iterable<number>): SelectionState {
    const selected = new Set(state.selected);
    for (const id of ids) {
        selected.add(id);
    }
    return { ...state, selected };
}

export function clearSelection(state: SelectionState): SelectionState {
    return { selected: new Set(), anchor: undefined, focus: state.focus };
}

export type GroupKey = 'routing_unit' | 'subbasin';

/** The ids of every HRU (not only the shown ones) in the same routing unit or subbasin as `row`. */
export function idsInGroup(rows: readonly HruTableRow[], key: GroupKey, value: string | null): number[] {
    if (value === null) {
        return [];
    }
    return rows.filter(row => row[key] === value).map(row => row.id);
}

/** The ids as the text for the IDs box: `1-3,7`. */
export function selectionToText(selected: ReadonlySet<number>): string {
    return formatHruIds(Array.from(selected));
}

/**
 * The selection the IDs box describes, limited to HRUs that exist in the table;
 * empty when the text is not valid ids or lies outside the table's range.
 */
export function selectionFromText(text: string, rows: readonly HruTableRow[]): Set<number> {
    if (rows.length === 0 || !text.trim()) {
        return new Set();
    }
    let min = rows[0].id;
    let max = rows[0].id;
    for (const row of rows) {
        min = Math.min(min, row.id);
        max = Math.max(max, row.id);
    }
    // validateHruIdText bounds the numbers before expandHruIds allocates anything.
    if (validateHruIdText(text, min, max) !== undefined) {
        return new Set();
    }
    const known = new Set(rows.map(row => row.id));
    return new Set(expandHruIds(text).filter(id => known.has(id)));
}

/** "37 selected of 4222 (120 shown)". */
export function selectionLine(selectedCount: number, total: number, shown: number): string {
    return `${selectedCount} selected of ${total}` + (shown !== total ? ` (${shown} shown)` : '');
}
