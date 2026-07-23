import * as assert from 'assert';
import { DatasetModel, EngineRow, FkEdge, IncomingReference } from '../datasetEngineCore';
import {
    toNumber,
    valuesEqual,
    matchValue,
    evaluatePredicate,
    queryRows,
    findOrphans,
    renderQueryResult,
} from '../datasetQuery';

class MockModel implements DatasetModel {
    private rows = new Map<string, EngineRow[]>();
    private incoming = new Map<string, IncomingReference[]>(); // `${table}:${pk}` -> refs
    addRow(row: EngineRow): this {
        const list = this.rows.get(row.table) ?? [];
        list.push(row);
        this.rows.set(row.table, list);
        return this;
    }
    addIncoming(table: string, pk: string, ref: IncomingReference): this {
        const key = `${table}:${pk.toLowerCase()}`;
        const list = this.incoming.get(key) ?? [];
        list.push(ref);
        this.incoming.set(key, list);
        return this;
    }
    getRow(table: string, pk: string): EngineRow | undefined {
        return this.getRows(table).find(r => r.pk.toLowerCase() === pk.toLowerCase());
    }
    getRows(table: string): EngineRow[] { return this.rows.get(table) ?? []; }
    getForeignKeys(): FkEdge[] { return []; }
    getIncomingReferences(table: string, pk: string): IncomingReference[] {
        return this.incoming.get(`${table}:${pk.toLowerCase()}`) ?? [];
    }
    getFileName(table: string): string | undefined { return `${table}.file`; }
    getTableForFile(): string | undefined { return undefined; }
    getTableNames(): string[] { return [...this.rows.keys()]; }
    resolveEntityTable(): string | undefined { return undefined; }
}

function row(pk: string, line: number, values: Record<string, string>): EngineRow {
    return { table: 'channel', file: 'channel.cha', line, pk, values };
}

function buildModel(): MockModel {
    const m = new MockModel();
    m.addRow(row('1', 3, { id: '1', name: 'cha1', slope: '0.02', lu: 'corn' }));
    m.addRow(row('2', 4, { id: '2', name: 'cha2', slope: '0.15', lu: 'soyb' }));
    m.addRow(row('3', 5, { id: '3', name: 'cha3', slope: '0.30', lu: 'corn' }));
    return m;
}

suite('Dataset query', () => {

    test('toNumber and valuesEqual are numeric-aware', () => {
        assert.strictEqual(toNumber('1,000'), 1000);
        assert.strictEqual(toNumber('abc'), null);
        assert.strictEqual(valuesEqual('1.0', '1'), true);   // numeric equality
        assert.strictEqual(valuesEqual('Corn', 'corn'), true); // case-insensitive text
        assert.strictEqual(valuesEqual('corn', 'soy'), false);
    });

    test('matchValue implements each operator', () => {
        assert.strictEqual(matchValue('0.15', 'gt', '0.1'), true);
        assert.strictEqual(matchValue('0.05', 'gt', '0.1'), false);
        assert.strictEqual(matchValue('corn', 'contains', 'or'), true);
        assert.strictEqual(matchValue('corn', 'in', 'corn,soyb'), true);
        assert.strictEqual(matchValue('', 'is_empty', ''), true);
        // non-numeric cell with a numeric operator does not match
        assert.strictEqual(matchValue('abc', 'gt', '1'), false);
    });

    test('evaluatePredicate honors negate', () => {
        const r = row('1', 3, { lu: 'corn' });
        assert.strictEqual(evaluatePredicate(r, { column: 'lu', operator: 'equals', value: 'corn' }), true);
        assert.strictEqual(evaluatePredicate(r, { column: 'lu', operator: 'equals', value: 'corn', negate: true }), false);
    });

    test('queryRows filters with AND / OR and bounds results', () => {
        const m = buildModel();
        // slope > 0.1
        const steep = queryRows(m, 'channel', [{ column: 'slope', operator: 'gt', value: '0.1' }]);
        assert.deepStrictEqual(steep.rows.map(r => r.pk).sort(), ['2', '3']);
        assert.strictEqual(steep.total, 2);

        // corn AND slope > 0.1  -> only cha3
        const cornSteep = queryRows(m, 'channel', [
            { column: 'lu', operator: 'equals', value: 'corn' },
            { column: 'slope', operator: 'gt', value: '0.1' },
        ], { match: 'all' });
        assert.deepStrictEqual(cornSteep.rows.map(r => r.pk), ['3']);

        // corn OR slope > 0.2 -> cha1, cha3
        const either = queryRows(m, 'channel', [
            { column: 'lu', operator: 'equals', value: 'corn' },
            { column: 'slope', operator: 'gt', value: '0.2' },
        ], { match: 'any' });
        assert.deepStrictEqual(either.rows.map(r => r.pk).sort(), ['1', '3']);

        // limit bounds and flags truncation
        const limited = queryRows(m, 'channel', [], { limit: 2 });
        assert.strictEqual(limited.rows.length, 2);
        assert.strictEqual(limited.total, 3);
        assert.strictEqual(limited.truncated, true);
    });

    test('findOrphans returns rows nothing references', () => {
        const m = buildModel();
        // Mark channel 1 as referenced; 2 and 3 are orphans.
        m.addIncoming('channel', '1', {
            fromTable: 'hru', fromColumn: 'cha', fromPk: '9', fromFile: 'hru.file', fromLine: 1,
        });
        const orphans = findOrphans(m, 'channel');
        assert.deepStrictEqual(orphans.rows.map(r => r.pk).sort(), ['2', '3']);
        assert.strictEqual(orphans.total, 2);
    });

    test('renderQueryResult produces a compact markdown table', () => {
        const m = buildModel();
        const result = queryRows(m, 'channel', [{ column: 'lu', operator: 'equals', value: 'corn' }]);
        const md = renderQueryResult(result, 'channel.cha', 'rows where lu = corn', ['name', 'slope']);
        assert.ok(md.includes('channel.cha: 2 rows where lu = corn'));
        assert.ok(md.includes('| name | slope |'));
        assert.ok(md.includes('cha1'));
        // empty result renders a friendly message
        const none = queryRows(m, 'channel', [{ column: 'lu', operator: 'equals', value: 'rice' }]);
        assert.ok(renderQueryResult(none, 'channel.cha', 'rows where lu = rice').includes('No rows'));
    });
});
