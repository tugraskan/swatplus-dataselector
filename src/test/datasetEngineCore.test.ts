import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    DatasetModel,
    EngineRow,
    FkEdge,
    IncomingReference,
    describeEntity,
    findReferences,
    lookupDocs,
} from '../datasetEngineCore';
import { EnrichedSchemaIndex, OutputSchemaIndex } from '../enrichedSchemaCore';

/** Minimal in-memory DatasetModel for tests. */
class MockModel implements DatasetModel {
    private rows = new Map<string, Map<string, EngineRow>>();
    private fks = new Map<string, FkEdge[]>();
    private files = new Map<string, string>();       // table -> file
    private tables = new Map<string, string>();       // file -> table
    private entities = new Map<string, string>();     // kind -> table

    addFile(table: string, file: string): this {
        this.files.set(table, file);
        this.tables.set(file.toLowerCase(), table);
        return this;
    }
    addEntity(kind: string, table: string): this {
        this.entities.set(kind.toLowerCase(), table);
        return this;
    }
    addRow(row: EngineRow): this {
        if (!this.rows.has(row.table)) {
            this.rows.set(row.table, new Map());
        }
        this.rows.get(row.table)!.set(row.pk.toLowerCase(), row);
        return this;
    }
    addFk(table: string, fk: FkEdge): this {
        const list = this.fks.get(table) ?? [];
        list.push(fk);
        this.fks.set(table, list);
        return this;
    }

    getRow(table: string, pk: string): EngineRow | undefined {
        return this.rows.get(table)?.get(pk.toLowerCase());
    }
    getRows(table: string): EngineRow[] {
        return [...(this.rows.get(table)?.values() ?? [])];
    }
    getForeignKeys(table: string): FkEdge[] {
        return this.fks.get(table) ?? [];
    }
    getIncomingReferences(table: string, pk: string): IncomingReference[] {
        const refs: IncomingReference[] = [];
        for (const [srcTable, edges] of this.fks.entries()) {
            for (const edge of edges) {
                if (edge.targetTable !== table) {
                    continue;
                }
                for (const row of this.getRows(srcTable)) {
                    if ((row.values[edge.column] ?? '').toLowerCase() === pk.toLowerCase()) {
                        refs.push({
                            fromTable: srcTable, fromColumn: edge.column,
                            fromPk: row.pk, fromFile: row.file, fromLine: row.line,
                        });
                    }
                }
            }
        }
        return refs;
    }
    getFileName(table: string): string | undefined {
        return this.files.get(table);
    }
    getTableForFile(file: string): string | undefined {
        return this.tables.get(file.toLowerCase());
    }
    resolveEntityTable(kind: string): string | undefined {
        return this.entities.get(kind.toLowerCase());
    }
}

function buildModel(): MockModel {
    const model = new MockModel();
    model.addFile('hru_data_hru', 'hru-data.hru').addEntity('hru', 'hru_data_hru');
    model.addFile('soils_sol', 'soils.sol');
    model.addFk('hru_data_hru', { column: 'soil', targetTable: 'soils_sol', targetColumn: 'name' });
    model.addRow({
        table: 'hru_data_hru', file: 'hru-data.hru', line: 82, pk: '81',
        values: { id: '81', name: 'hru81', soil: 'clay_loam', lu_mgt: 'null', topo: 'topo7' },
    });
    model.addRow({
        table: 'soils_sol', file: 'soils.sol', line: 5, pk: 'clay_loam',
        values: { name: 'clay_loam', hyd_grp: 'C' },
    });
    return model;
}

suite('Dataset engine core', () => {

    test('describeEntity joins FK targets and lists connections', () => {
        const out = describeEntity(buildModel(), {}, 'hru_data_hru', '81');
        assert.ok(out.includes('hru-data.hru — 81'));
        assert.ok(out.includes('## Connections'));
        assert.ok(out.includes('**soil** → `clay_loam` in `soils.sol`'));
        // resolved FK should not be flagged unresolved
        assert.ok(!out.includes('soil** → `clay_loam` in `soils.sol` ⚠'));
        // nullish FK (lu_mgt = null) is omitted from connections
        assert.ok(!out.includes('lu_mgt'));
    });

    test('describeEntity flags an unresolved FK', () => {
        const model = buildModel();
        model.addRow({
            table: 'hru_data_hru', file: 'hru-data.hru', line: 83, pk: '82',
            values: { id: '82', name: 'hru82', soil: 'missing_soil' },
        });
        const out = describeEntity(model, {}, 'hru_data_hru', '82');
        assert.ok(out.includes('⚠ _(unresolved)_'));
    });

    test('describeEntity reports incoming references', () => {
        const out = describeEntity(buildModel(), {}, 'soils_sol', 'clay_loam');
        assert.ok(out.includes('## Referenced by (1)'));
        assert.ok(out.includes('`hru_data_hru`.soil (1)'));
    });

    test('describeEntity handles a missing record', () => {
        const out = describeEntity(buildModel(), {}, 'hru_data_hru', '999');
        assert.ok(out.includes('No record found'));
    });

    test('findReferences lists referencing rows', () => {
        const out = findReferences(buildModel(), 'soils_sol', 'clay_loam');
        assert.ok(out.includes('References to soils.sol — clay_loam (1)'));
        assert.ok(out.includes('`hru-data.hru`:82 — soil of row `81`'));
    });

    test('findReferences reports when nothing references the entity', () => {
        const out = findReferences(buildModel(), 'hru_data_hru', '81');
        assert.ok(out.includes('Nothing references'));
    });

    test('lookupDocs reads real input and output schemas when present', () => {
        const schemaDir = path.join(__dirname, '..', '..', 'resources', 'schema');
        const inputPath = path.join(schemaDir, 'swatplus-schema-enriched.json');
        const outputPath = path.join(schemaDir, 'swatplus-output-schema.json');
        if (!fs.existsSync(inputPath) || !fs.existsSync(outputPath)) {
            return;
        }
        const docs = {
            input: new EnrichedSchemaIndex(JSON.parse(fs.readFileSync(inputPath, 'utf-8'))),
            output: new OutputSchemaIndex(JSON.parse(fs.readFileSync(outputPath, 'utf-8'))),
        };
        // input column
        const gwFlo = lookupDocs(docs, 'aquifer.aqu', 'gw_flo');
        assert.ok(gwFlo.includes('Units:** mm'));
        assert.ok(gwFlo.includes('Source:'));
        // output column
        const flo = lookupDocs(docs, 'aquifer_day.csv', 'flo');
        assert.ok(flo.includes('Units:** mm'));
        // input file summary
        const fileDoc = lookupDocs(docs, 'aquifer.aqu');
        assert.ok(fileDoc.includes('aquifer.aqu'));
        assert.ok(fileDoc.toLowerCase().includes('aquifer'));
    });

    test('lookupDocs is graceful with no schemas', () => {
        assert.ok(lookupDocs({}, 'x.y', 'z').includes('No documentation'));
        assert.ok(lookupDocs({}, 'x.y').includes('No documentation'));
    });
});
