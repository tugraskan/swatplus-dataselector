import * as assert from 'assert';
import { SwatIndexer, type FKReference } from '../indexer';

suite('Missing Foreign Key Target Files', () => {
    test('reports unresolved foreign keys whose target table file is not indexed', () => {
        const indexer = Object.create(SwatIndexer.prototype) as SwatIndexer;
        const mutableIndexer = indexer as unknown as {
            fkReferences: FKReference[];
            index: Map<string, Map<string, unknown>>;
            tableToFileMap: Map<string, string>;
        };

        mutableIndexer.fkReferences = [
            {
                sourceFile: 'management.sch',
                sourceTable: 'management_sch',
                sourceLine: 12,
                sourceColumn: 'op_data1',
                fkValue: 'sprinkler',
                targetTable: 'irr_ops',
                targetColumn: 'name',
                resolved: false
            },
            {
                sourceFile: 'management.sch',
                sourceTable: 'management_sch',
                sourceLine: 13,
                sourceColumn: 'op_data1',
                fkValue: 'corn_plant',
                targetTable: 'plant_ini',
                targetColumn: 'name',
                resolved: false
            },
            {
                sourceFile: 'management.sch',
                sourceTable: 'management_sch',
                sourceLine: 14,
                sourceColumn: 'op_data1',
                fkValue: 'resolved_value',
                targetTable: 'chem_app_ops',
                targetColumn: 'name',
                resolved: true
            }
        ];

        mutableIndexer.index = new Map([
            ['plant_ini', new Map()]
        ]);

        mutableIndexer.tableToFileMap = new Map([
            ['irr_ops', 'irr.ops'],
            ['plant_ini', 'plant.ini'],
            ['chem_app_ops', 'chem_app.ops']
        ]);

        const issues = indexer.getMissingForeignKeyFileIssues();

        assert.strictEqual(issues.length, 1);
        assert.deepStrictEqual(issues[0], {
            sourceFile: 'management.sch',
            sourceLine: 12,
            sourceTable: 'management_sch',
            sourceColumn: 'op_data1',
            fkValue: 'sprinkler',
            targetTable: 'irr_ops',
            targetColumn: 'name',
            targetFile: 'irr.ops'
        });
    });
});
