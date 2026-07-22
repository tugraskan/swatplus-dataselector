import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { IndexFileDatasetModel, IndexFile } from '../indexFileModel';
import { describeEntity, findReferences } from '../datasetEngineCore';

const SCHEMA: { tables: { [f: string]: { columns: Array<{ name: string; is_foreign_key?: boolean; fk_target?: { table: string; column: string } }> } } } = {
    tables: {
        'hru-data.hru': {
            columns: [
                { name: 'id' },
                { name: 'name' },
                { name: 'soil', is_foreign_key: true, fk_target: { table: 'soils_sol', column: 'id' } },
            ],
        },
        'soils.sol': { columns: [{ name: 'name' }, { name: 'hyd_grp' }] },
    },
};

const INDEX: IndexFile = {
    fileTableMap: { 'hru-data.hru': 'hru_data_hru', 'soils.sol': 'soils_sol' },
    fkReferences: [],
    tables: {
        hru_data_hru: [
            { file: 'hru-data.hru', tableName: 'hru_data_hru', lineNumber: 3, pkValue: '1',
              pkValueLower: '1', values: { id: '1', name: 'hru0001', soil: 'clay_loam' } },
        ],
        soils_sol: [
            { file: 'soils.sol', tableName: 'soils_sol', lineNumber: 5, pkValue: 'clay_loam',
              pkValueLower: 'clay_loam', values: { name: 'clay_loam', hyd_grp: 'C' } },
        ],
    },
};

suite('Index-file dataset model', () => {

    test('resolves rows, FK edges, and file/table mapping', () => {
        const model = new IndexFileDatasetModel(INDEX, SCHEMA);
        assert.strictEqual(model.resolveEntityTable('hru'), 'hru_data_hru');
        assert.strictEqual(model.getFileName('soils_sol'), 'soils.sol');
        assert.strictEqual(model.getRow('hru_data_hru', '1')?.values.soil, 'clay_loam');
        const fks = model.getForeignKeys('hru_data_hru');
        assert.strictEqual(fks.length, 1);
        assert.strictEqual(fks[0].targetTable, 'soils_sol');
    });

    test('describeEntity works over the index model', () => {
        const model = new IndexFileDatasetModel(INDEX, SCHEMA);
        const out = describeEntity(model, {}, 'hru_data_hru', '1');
        assert.ok(out.includes('**soil** → `clay_loam` in `soils.sol`'));
    });

    test('name-pointer reverse references resolve via the scan', () => {
        const model = new IndexFileDatasetModel(INDEX, SCHEMA);
        const out = findReferences(model, 'soils_sol', 'clay_loam');
        assert.ok(out.includes('`hru-data.hru`:3 — soil of row `1`'));
    });

    test('loads the real Ames index when present (integration)', () => {
        // Optional: only runs if a prebuilt Ames index is available.
        const indexPath = process.env.SWAT_AMES_INDEX;
        const schemaPath = path.join(
            __dirname, '..', '..', 'resources', 'schema', 'swatplus-schema-enriched.json');
        if (!indexPath || !fs.existsSync(indexPath) || !fs.existsSync(schemaPath)) {
            return;
        }
        const model = new IndexFileDatasetModel(
            JSON.parse(fs.readFileSync(indexPath, 'utf-8')),
            JSON.parse(fs.readFileSync(schemaPath, 'utf-8')));
        const hru = model.resolveEntityTable('hru');
        assert.ok(hru, 'expected to resolve the hru table');
        const out = describeEntity(model, {}, hru!, '1');
        assert.ok(out.includes('## Connections'));
    });
});
