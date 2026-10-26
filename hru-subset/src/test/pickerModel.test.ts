import * as assert from 'assert';
import {
    cellText,
    clearSelection,
    clickRow,
    COLUMNS,
    EMPTY_SELECTION,
    filterRows,
    idsInGroup,
    indexRows,
    nextSort,
    selectIds,
    selectionFromText,
    selectionLine,
    selectionToText,
    sortRows
} from '../picker/model';
import type { HruTableRow } from '../summary';

function row(id: number, extra: Partial<HruTableRow> = {}): HruTableRow {
    return {
        id,
        name: `n${id}`,
        landuse: `lum${id}`,
        landuse_group: 'forest',
        plant_community: 'frst',
        management: 'null',
        area_ha: id * 1.5,
        subbasin: id <= 3 ? '0101' : '0102',
        routing_unit: id <= 2 ? 'ru1_0101' : id === 3 ? 'ru2_0101' : 'ru1_0102',
        wetland: false,
        wetland_name: null,
        receives_upstream: false,
        ...extra
    };
}

const rows: HruTableRow[] = [
    row(1),
    row(2, { landuse_group: 'row_crop', plant_community: 'corn', area_ha: 945.501 }),
    row(3, { wetland: true, wetland_name: 'wet_0101_1', receives_upstream: true, landuse_group: 'forest' }),
    row(4, { subbasin: null, routing_unit: null, area_ha: null, plant_community: null }),
    row(10, { routing_unit: 'ru10_0102', wetland: true, wetland_name: 'wet_0102_1' })
];

suite('HRU picker model', () => {
    suite('cells', () => {
        test('missing values are a dash, yes/no columns are "yes" or empty, area has a thousands separator', () => {
            assert.strictEqual(cellText(rows[3], 'subbasin'), '-');
            assert.strictEqual(cellText(rows[3], 'area_ha'), '-');
            assert.strictEqual(cellText(rows[2], 'wetland'), 'yes');
            assert.strictEqual(cellText(rows[0], 'wetland'), '');
            assert.strictEqual(cellText(rows[2], 'receives_upstream'), 'yes');
            assert.strictEqual(cellText(rows[1], 'area_ha'), '945.501');
            assert.strictEqual(cellText({ ...rows[0], area_ha: 1234.5678 }, 'area_ha'), '1,234.568');
            assert.strictEqual(cellText(rows[0], 'id'), '1');
        });

        test('there is one column for each field the picker shows, in the order proposed', () => {
            assert.deepStrictEqual(COLUMNS.map(column => column.key), [
                'id', 'name', 'landuse', 'landuse_group', 'plant_community', 'management',
                'area_ha', 'subbasin', 'routing_unit', 'wetland', 'receives_upstream'
            ]);
        });
    });

    suite('filter', () => {
        const indexed = indexRows(rows);
        const ids = (query: string) => filterRows(indexed, query).map(item => item.row.id);

        test('an empty filter keeps every row', () => {
            assert.deepStrictEqual(ids(''), [1, 2, 3, 4, 10]);
            assert.deepStrictEqual(ids('   '), [1, 2, 3, 4, 10]);
        });

        test('matches any column, case-insensitively', () => {
            assert.deepStrictEqual(ids('CORN'), [2]);
            assert.deepStrictEqual(ids('ru10_0102'), [10]);
            assert.deepStrictEqual(ids('lum10'), [10]);
        });

        test('every word has to match', () => {
            assert.deepStrictEqual(ids('forest 0102'), [10]);
            assert.deepStrictEqual(ids('forest 0102 nothing'), []);
        });

        test('"wetland" and "upstream" find the flagged rows', () => {
            assert.deepStrictEqual(ids('wetland'), [3, 10]);
            assert.deepStrictEqual(ids('upstream'), [3]);
            assert.deepStrictEqual(ids('wetland upstream'), [3]);
        });
    });

    suite('sort', () => {
        const indexed = indexRows(rows);
        const order = (key: Parameters<typeof nextSort>[1], direction: 'asc' | 'desc') =>
            sortRows(indexed, { key, direction }).map(item => item.row.id);

        test('numbers sort as numbers', () => {
            assert.deepStrictEqual(order('id', 'asc'), [1, 2, 3, 4, 10]);
            assert.deepStrictEqual(order('id', 'desc'), [10, 4, 3, 2, 1]);
            assert.deepStrictEqual(order('area_ha', 'asc'), [1, 3, 10, 2, 4]);
        });

        test('missing values go last in either direction', () => {
            assert.deepStrictEqual(order('area_ha', 'desc'), [2, 10, 3, 1, 4]);
            assert.strictEqual(order('subbasin', 'asc').at(-1), 4);
            assert.strictEqual(order('subbasin', 'desc').at(-1), 4);
        });

        test('text with digits sorts in natural order', () => {
            // ru2_ before ru10_
            const sorted = sortRows(indexRows([row(1, { routing_unit: 'ru10_x' }), row(2, { routing_unit: 'ru2_x' })]), { key: 'routing_unit', direction: 'asc' });
            assert.deepStrictEqual(sorted.map(item => item.row.id), [2, 1]);
        });

        test('ties keep the file order', () => {
            assert.deepStrictEqual(order('landuse_group', 'asc'), [1, 3, 4, 10, 2]);
            assert.deepStrictEqual(order('landuse_group', 'desc'), [2, 1, 3, 4, 10]);
        });

        test('yes comes first when ascending', () => {
            assert.deepStrictEqual(order('wetland', 'asc'), [3, 10, 1, 2, 4]);
        });

        test('does not reorder its input, and no sort returns the file order', () => {
            const before = indexed.map(item => item.row.id);
            sortRows(indexed, { key: 'id', direction: 'desc' });
            assert.deepStrictEqual(indexed.map(item => item.row.id), before);
            assert.deepStrictEqual(sortRows(indexed, undefined).map(item => item.row.id), before);
        });

        test('clicking a header cycles ascending, descending, off', () => {
            const first = nextSort(undefined, 'area_ha');
            assert.deepStrictEqual(first, { key: 'area_ha', direction: 'asc' });
            const second = nextSort(first, 'area_ha');
            assert.deepStrictEqual(second, { key: 'area_ha', direction: 'desc' });
            assert.strictEqual(nextSort(second, 'area_ha'), undefined);
            assert.deepStrictEqual(nextSort(second, 'id'), { key: 'id', direction: 'asc' });
        });
    });

    suite('selecting', () => {
        const visible = [1, 2, 3, 4, 10];
        const none = { ctrl: false, shift: false };

        test('a plain click selects that row only', () => {
            let state = clickRow(EMPTY_SELECTION, visible, 2, none);
            assert.deepStrictEqual(Array.from(state.selected), [2]);
            state = clickRow(state, visible, 4, none);
            assert.deepStrictEqual(Array.from(state.selected), [4]);
            assert.strictEqual(state.focus, 4);
        });

        test('ctrl-click toggles', () => {
            let state = clickRow(EMPTY_SELECTION, visible, 1, none);
            state = clickRow(state, visible, 3, { ctrl: true, shift: false });
            assert.deepStrictEqual(Array.from(state.selected).sort((a, b) => a - b), [1, 3]);
            state = clickRow(state, visible, 1, { ctrl: true, shift: false });
            assert.deepStrictEqual(Array.from(state.selected), [3]);
        });

        test('shift-click selects from the anchor to the row, in the order on screen', () => {
            let state = clickRow(EMPTY_SELECTION, visible, 2, none);
            state = clickRow(state, visible, 10, { ctrl: false, shift: true });
            assert.deepStrictEqual(Array.from(state.selected).sort((a, b) => a - b), [2, 3, 4, 10]);
            assert.strictEqual(state.anchor, 2);
            // Going back up replaces the earlier range.
            state = clickRow(state, visible, 1, { ctrl: false, shift: true });
            assert.deepStrictEqual(Array.from(state.selected).sort((a, b) => a - b), [1, 2]);
        });

        test('shift-click follows the sorted order, not the id order', () => {
            const sorted = [10, 3, 1, 4, 2];
            let state = clickRow(EMPTY_SELECTION, sorted, 3, none);
            state = clickRow(state, sorted, 4, { ctrl: false, shift: true });
            assert.deepStrictEqual(Array.from(state.selected).sort((a, b) => a - b), [1, 3, 4]);
        });

        test('ctrl+shift adds the range to what is selected', () => {
            let state = clickRow(EMPTY_SELECTION, visible, 10, none);
            state = clickRow(state, visible, 1, none);
            state = clickRow(state, visible, 3, { ctrl: true, shift: true });
            assert.deepStrictEqual(Array.from(state.selected).sort((a, b) => a - b), [1, 2, 3]);
            const added = clickRow(selectIds(EMPTY_SELECTION, [10]), visible, 2, { ctrl: false, shift: false });
            const extended = clickRow(added, visible, 4, { ctrl: true, shift: true });
            assert.deepStrictEqual(Array.from(extended.selected).sort((a, b) => a - b), [2, 3, 4]);
        });

        test('shift-click with no anchor selects just that row', () => {
            const state = clickRow(EMPTY_SELECTION, visible, 3, { ctrl: false, shift: true });
            assert.deepStrictEqual(Array.from(state.selected), [3]);
        });

        test('selects a whole routing unit or subbasin, hidden rows included', () => {
            assert.deepStrictEqual(idsInGroup(rows, 'routing_unit', 'ru1_0101'), [1, 2]);
            assert.deepStrictEqual(idsInGroup(rows, 'subbasin', '0102'), [10]);
            assert.deepStrictEqual(idsInGroup(rows, 'subbasin', null), []);
            const state = selectIds(clickRow(EMPTY_SELECTION, visible, 10, none), idsInGroup(rows, 'subbasin', '0101'));
            assert.deepStrictEqual(Array.from(state.selected).sort((a, b) => a - b), [1, 2, 3, 10]);
        });

        test('clear empties the selection but keeps the focused row', () => {
            const state = clearSelection(clickRow(EMPTY_SELECTION, visible, 3, none));
            assert.strictEqual(state.selected.size, 0);
            assert.strictEqual(state.focus, 3);
        });

        test('clicks do not change the state they were given', () => {
            const first = clickRow(EMPTY_SELECTION, visible, 1, none);
            const snapshot = Array.from(first.selected);
            clickRow(first, visible, 2, { ctrl: true, shift: false });
            assert.deepStrictEqual(Array.from(first.selected), snapshot);
            assert.strictEqual(EMPTY_SELECTION.selected.size, 0);
        });
    });

    suite('the IDs box and the selection', () => {
        test('writes compressed ids', () => {
            assert.strictEqual(selectionToText(new Set([3, 1, 2, 7])), '1-3,7');
            assert.strictEqual(selectionToText(new Set([1532, 1538, 3978])), '1532,1538,3978');
            assert.strictEqual(selectionToText(new Set()), '');
        });

        test('reads the box back, keeping only HRUs the table has', () => {
            assert.deepStrictEqual(Array.from(selectionFromText('1-3,10', rows)).sort((a, b) => a - b), [1, 2, 3, 10]);
            // 5-9 are inside the range but not in the table
            assert.deepStrictEqual(Array.from(selectionFromText('3-6', rows)).sort((a, b) => a - b), [3, 4]);
        });

        test('text that is not valid ids, or lies outside the table, selects nothing', () => {
            assert.strictEqual(selectionFromText('', rows).size, 0);
            assert.strictEqual(selectionFromText('1-', rows).size, 0);
            assert.strictEqual(selectionFromText('abc', rows).size, 0);
            assert.strictEqual(selectionFromText('1-2000000000', rows).size, 0);
            assert.strictEqual(selectionFromText('1', []).size, 0);
        });

        test('round trips a large selection', () => {
            const many = Array.from({ length: 4222 }, (_, index) => index + 1);
            const text = selectionToText(new Set(many));
            assert.strictEqual(text, '1-4222');
            const table = many.map(id => row(id));
            assert.strictEqual(selectionFromText(text, table).size, 4222);
        });

        test('the selected-count line', () => {
            assert.strictEqual(selectionLine(0, 4222, 4222), '0 selected of 4222');
            assert.strictEqual(selectionLine(37, 4222, 120), '37 selected of 4222 (120 shown)');
        });
    });

    test('filtering and sorting 4222 rows takes a fraction of a second', () => {
        const many = Array.from({ length: 4222 }, (_, index) => row(index + 1, {
            routing_unit: `ru${(index % 58) + 1}_020700090${(index % 7) + 1}`,
            wetland: index % 150 === 0
        }));
        const started = Date.now();
        const indexed = indexRows(many);
        for (const query of ['', 'ru5_', 'wetland', 'forest 0102']) {
            sortRows(filterRows(indexed, query), { key: 'routing_unit', direction: 'asc' });
        }
        sortRows(indexed, { key: 'management', direction: 'desc' });
        assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
    });
});
