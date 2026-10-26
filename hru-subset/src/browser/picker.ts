// The HRU picker tab's script: a virtual-scrolled table of every HRU (only the
// rows in view are in the DOM, so 4222 rows stay responsive), with filter, sort
// and multi-select. The table logic lives in picker/model.ts. Bundled to
// dist/picker.js; type-checked with tsconfig.browser.json.

import type { PickerInbound, PickerOutbound } from '../protocol';
import {
    clearSelection,
    clickRow,
    COLUMNS,
    cellText,
    EMPTY_SELECTION,
    filterRows,
    idsInGroup,
    indexRows,
    IndexedRow,
    nextSort,
    selectIds,
    selectionFromText,
    selectionLine,
    SelectionState,
    selectionToText,
    SortState,
    sortRows
} from '../picker/model';
import type { HruTable } from '../summary';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const host = acquireVsCodeApi();
const ROW_HEIGHT = 24;
const BUFFER_ROWS = 12;

function send(message: PickerInbound): void {
    host.postMessage(message);
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`HRU picker: missing element #${id}`);
    }
    return element as T;
}

const filterInput = el<HTMLInputElement>('filterInput');
const selectShown = el<HTMLButtonElement>('selectShown');
const clearBtn = el<HTMLButtonElement>('clearBtn');
const selectRu = el<HTMLButtonElement>('selectRu');
const selectSubbasin = el<HTMLButtonElement>('selectSubbasin');
const useBtn = el<HTMLButtonElement>('useBtn');
const selectionLineEl = el('selectionLine');
const flashEl = el('flash');
const scroller = el('scroller');
const headerEl = el('header');
const bodyEl = el('body');
const messageEl = el('message');
const noticeEl = el('notice');

let table: HruTable | undefined;
let indexed: IndexedRow[] = [];
let shown: IndexedRow[] = [];
let shownIds: number[] = [];
let sort: SortState | undefined;
let query = '';
let selection: SelectionState = EMPTY_SELECTION;
let flashTimer: number | undefined;

// ---- header ----------------------------------------------------------------------------

function drawHeader(): void {
    while (headerEl.firstChild) {
        headerEl.removeChild(headerEl.firstChild);
    }
    for (const column of COLUMNS) {
        const cell = document.createElement('div');
        cell.className = `cell hcell ${column.align}`;
        cell.style.width = `${column.width}px`;
        cell.title = `${column.hint}. Click to sort.`;
        const label = document.createElement('span');
        label.textContent = column.title;
        cell.append(label);
        if (sort && sort.key === column.key) {
            const arrow = document.createElement('span');
            arrow.className = 'arrow';
            arrow.textContent = sort.direction === 'asc' ? '▲' : '▼';
            cell.append(arrow);
        }
        cell.addEventListener('click', () => {
            sort = nextSort(sort, column.key);
            recompute();
        });
        headerEl.append(cell);
    }
}

// ---- rows ------------------------------------------------------------------------------

function drawRows(): void {
    const viewport = scroller.clientHeight;
    const first = Math.max(0, Math.floor(scroller.scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const last = Math.min(shown.length, Math.ceil((scroller.scrollTop + viewport) / ROW_HEIGHT) + BUFFER_ROWS);
    const fragment = document.createDocumentFragment();
    for (let index = first; index < last; index++) {
        const { row } = shown[index];
        const line = document.createElement('div');
        line.className = 'row' + (selection.selected.has(row.id) ? ' selected' : '') + (selection.focus === row.id ? ' focus' : '');
        line.style.top = `${index * ROW_HEIGHT}px`;
        line.dataset['id'] = String(row.id);
        for (const column of COLUMNS) {
            const cell = document.createElement('div');
            cell.className = `cell ${column.align}`;
            cell.style.width = `${column.width}px`;
            const text = cellText(row, column.key);
            cell.textContent = text;
            if (text.length > 12) {
                cell.title = text;
            }
            line.append(cell);
        }
        fragment.append(line);
    }
    while (bodyEl.firstChild) {
        bodyEl.removeChild(bodyEl.firstChild);
    }
    bodyEl.append(fragment);
}

function updateStatus(): void {
    const total = table ? table.rows.length : 0;
    selectionLineEl.textContent = selectionLine(selection.selected.size, total, shown.length);
    useBtn.disabled = selection.selected.size === 0;
    clearBtn.disabled = selection.selected.size === 0;
    selectShown.disabled = shown.length === 0;

    const focusRow = table && selection.focus !== undefined ? table.rows.find(row => row.id === selection.focus) : undefined;
    const ru = focusRow?.routing_unit ?? null;
    const subbasin = focusRow?.subbasin ?? null;
    const ruCount = table ? idsInGroup(table.rows, 'routing_unit', ru).length : 0;
    const sbCount = table ? idsInGroup(table.rows, 'subbasin', subbasin).length : 0;
    selectRu.disabled = ru === null;
    selectSubbasin.disabled = subbasin === null;
    selectRu.textContent = ru === null ? 'Routing unit' : `Routing unit ${ru} (${ruCount})`;
    selectSubbasin.textContent = subbasin === null ? 'Subbasin' : `Subbasin ${subbasin} (${sbCount})`;
}

function recompute(): void {
    shown = sortRows(filterRows(indexed, query), sort);
    shownIds = shown.map(item => item.row.id);
    bodyEl.style.height = `${shown.length * ROW_HEIGHT}px`;
    messageEl.hidden = shown.length > 0 || !table;
    messageEl.textContent = shown.length === 0 && table ? 'No HRU matches the filter.' : '';
    drawHeader();
    drawRows();
    updateStatus();
}

function redraw(): void {
    drawRows();
    updateStatus();
}

function flash(text: string): void {
    flashEl.textContent = text;
    if (flashTimer !== undefined) {
        window.clearTimeout(flashTimer);
    }
    flashTimer = window.setTimeout(() => {
        flashEl.textContent = '';
    }, 2500);
}

// ---- input -----------------------------------------------------------------------------

bodyEl.addEventListener('mousedown', event => {
    const line = (event.target as HTMLElement).closest<HTMLElement>('.row');
    if (!line || !line.dataset['id']) {
        return;
    }
    event.preventDefault();
    scroller.focus();
    selection = clickRow(selection, shownIds, Number(line.dataset['id']), {
        ctrl: event.ctrlKey || event.metaKey,
        shift: event.shiftKey
    });
    redraw();
});

filterInput.addEventListener('input', () => {
    query = filterInput.value;
    scroller.scrollTop = 0;
    recompute();
});

scroller.addEventListener('scroll', () => drawRows());
window.addEventListener('resize', () => drawRows());

scroller.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selection = selectIds(selection, shownIds);
        redraw();
    } else if (event.key === 'Escape') {
        selection = clearSelection(selection);
        redraw();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (shownIds.length === 0) {
            return;
        }
        const at = selection.focus === undefined ? -1 : shownIds.indexOf(selection.focus);
        const next = Math.max(0, Math.min(shownIds.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
        selection = clickRow(selection, shownIds, shownIds[next], { ctrl: false, shift: event.shiftKey });
        const top = next * ROW_HEIGHT;
        if (top < scroller.scrollTop) {
            scroller.scrollTop = top;
        } else if (top + ROW_HEIGHT > scroller.scrollTop + scroller.clientHeight - ROW_HEIGHT) {
            scroller.scrollTop = top + ROW_HEIGHT * 2 - scroller.clientHeight;
        }
        redraw();
    }
});

selectShown.addEventListener('click', () => {
    selection = selectIds(selection, shownIds);
    redraw();
});
clearBtn.addEventListener('click', () => {
    selection = clearSelection(selection);
    redraw();
});
selectRu.addEventListener('click', () => addGroup('routing_unit'));
selectSubbasin.addEventListener('click', () => addGroup('subbasin'));

function addGroup(key: 'routing_unit' | 'subbasin'): void {
    if (!table || selection.focus === undefined) {
        return;
    }
    const focusRow = table.rows.find(row => row.id === selection.focus);
    if (!focusRow) {
        return;
    }
    selection = selectIds(selection, idsInGroup(table.rows, key, focusRow[key]));
    redraw();
}

useBtn.addEventListener('click', () => {
    const ids = selectionToText(selection.selected);
    if (ids) {
        send({ type: 'useSelection', ids });
        flash(`Wrote ${ids.length > 60 ? `${selection.selected.size} HRUs` : ids} to the HRU IDs box.`);
    }
});

// ---- messages from the extension ----------------------------------------------------------

function showTable(next: HruTable, initialIds: string): void {
    table = next;
    indexed = indexRows(next.rows);
    selection = { selected: selectionFromText(initialIds, next.rows) };
    messageEl.hidden = true;
    const notes = [...next.warnings];
    const sources = Object.entries(next.subbasin_sources).map(([name, count]) => `${count} from ${name}`).join(', ');
    notes.push(`Subbasin: ${sources || 'not found for any HRU'}. ${next.subbasin_rule}`);
    noticeEl.textContent = notes.join('  ');
    messageEl.className = 'empty';
    recompute();
    // Start at the first HRU already in the IDs box, so the selection is in view.
    const firstSelected = shownIds.findIndex(id => selection.selected.has(id));
    if (firstSelected > 0) {
        scroller.scrollTop = Math.max(0, (firstSelected - 2) * ROW_HEIGHT);
        drawRows();
    }
    send({ type: 'rendered', rows: next.rows.length, shown: shown.length });
}

window.addEventListener('message', event => {
    const message = event.data as PickerOutbound | undefined;
    if (!message) {
        return;
    }
    switch (message.type) {
        case 'loading':
            messageEl.hidden = false;
            messageEl.className = 'empty';
            messageEl.textContent = `Reading the HRUs of ${message.datasetPath}…`;
            selectionLineEl.textContent = 'Loading…';
            break;
        case 'table':
            showTable(message.table, message.initialIds);
            break;
        case 'error':
            messageEl.hidden = false;
            messageEl.className = 'error-text';
            messageEl.textContent = message.message;
            selectionLineEl.textContent = 'Could not read the HRUs.';
            break;
        case 'selection':
            if (table) {
                selection = { selected: selectionFromText(message.ids, table.rows), anchor: selection.anchor, focus: selection.focus };
                redraw();
            }
            break;
    }
});

drawHeader();
send({ type: 'ready' });
