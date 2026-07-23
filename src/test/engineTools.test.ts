import * as assert from 'assert';
import { DatasetModel, EngineRow, FkEdge, IncomingReference } from '../datasetEngineCore';
import { createEngineHost, ENGINE_TOOLS, getEngineTool } from '../engineTools';

class MockModel implements DatasetModel {
    private rows = new Map<string, EngineRow[]>();
    private entities = new Map<string, string>();
    addRow(row: EngineRow): this {
        const list = this.rows.get(row.table) ?? [];
        list.push(row);
        this.rows.set(row.table, list);
        return this;
    }
    addEntity(kind: string, table: string): this { this.entities.set(kind, table); return this; }
    getRow(table: string, pk: string): EngineRow | undefined {
        return this.getRows(table).find(r => r.pk.toLowerCase() === pk.toLowerCase());
    }
    getRows(table: string): EngineRow[] { return this.rows.get(table) ?? []; }
    getForeignKeys(): FkEdge[] { return []; }
    getIncomingReferences(): IncomingReference[] { return []; }
    getFileName(table: string): string | undefined {
        return table === 'hru_data' ? 'hru-data.hru' : `${table}.file`;
    }
    getTableForFile(): string | undefined { return undefined; }
    getTableNames(): string[] { return [...this.rows.keys()]; }
    resolveEntityTable(kind: string): string | undefined {
        return this.entities.get(kind) ?? (this.rows.has(kind) ? kind : undefined);
    }
}

function model(): MockModel {
    const m = new MockModel();
    m.addEntity('hru', 'hru_data');
    m.addRow({ table: 'hru_data', file: 'hru-data.hru', line: 3, pk: '1',
        values: { id: '1', name: 'hru0001', lu: 'corn' } });
    m.addRow({ table: 'hru_data', file: 'hru-data.hru', line: 4, pk: '2',
        values: { id: '2', name: 'hru0002', lu: 'soyb' } });
    return m;
}

suite('Engine tools', () => {

    test('host resolves entity kinds and returns rendered text', () => {
        const host = createEngineHost(model(), {});
        assert.ok(host.describeEntity('hru', '1').includes('hru-data.hru — 1'));
        assert.ok(host.listEntities('hru').includes('2 ids'));
        assert.ok(host.queryRows('hru', [{ column: 'lu', operator: 'equals', value: 'corn' }])
            .includes('matching rows'));
    });

    test('host reports an unresolved entity with a hint', () => {
        const host = createEngineHost(model(), {});
        const out = host.describeEntity('nope', '1');
        assert.ok(out.includes('Could not resolve'));
        assert.ok(out.includes('hru'));
    });

    test('ENGINE_TOOLS dispatch maps args onto the host', () => {
        const host = createEngineHost(model(), {});
        const describe = getEngineTool('describe_entity');
        assert.ok(describe);
        assert.ok(describe!.invoke(host, { entity: 'hru', id: '2' }).includes('hru0002'));

        const query = getEngineTool('query_rows');
        const out = query!.invoke(host, {
            entity: 'hru',
            predicates: [{ column: 'lu', operator: 'equals', value: 'soyb' }],
        });
        assert.ok(out.includes('hru0002'));
        assert.ok(!out.includes('hru0001'));
    });

    test('every tool has a name, description, and schema', () => {
        assert.ok(ENGINE_TOOLS.length >= 6);
        for (const t of ENGINE_TOOLS) {
            assert.ok(t.name && t.description);
            assert.strictEqual(typeof t.inputSchema, 'object');
            assert.strictEqual(typeof t.invoke, 'function');
        }
    });
});
