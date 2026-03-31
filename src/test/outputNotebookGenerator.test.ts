import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateOutputNotebooks } from '../outputNotebookGenerator';
import type { Schema, SchemaTable } from '../indexer';

function createSchemaTable(fileName: string, modelClass: string): SchemaTable {
    return {
        file_name: fileName,
        table_name: fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase(),
        model_class: modelClass,
        has_metadata_line: true,
        has_header_line: true,
        data_starts_after: 2,
        columns: [],
        primary_keys: [],
        foreign_keys: [],
        notes: ''
    };
}

suite('Output Notebook Generator', () => {
    let tempDatasetPath: string;

    setup(() => {
        tempDatasetPath = fs.mkdtempSync(path.join(os.tmpdir(), 'swat-output-notebooks-'));
    });

    teardown(() => {
        fs.rmSync(tempDatasetPath, { recursive: true, force: true });
    });

    test('generates notebooks for outputs and skips known inputs', () => {
        const schema: Schema = {
            schema_version: 'test',
            source: {
                repo: 'test',
                commit: 'test',
                generated_on: '2026-03-31'
            },
            tables: {
                'con.txt': createSchemaTable('con.txt', 'project.config'),
                'yield.txt': createSchemaTable('yield.txt', 'output.summary')
            }
        };

        fs.writeFileSync(path.join(tempDatasetPath, 'file.cio'), 'file.cio\n1 con.txt\n', 'utf-8');
        fs.writeFileSync(path.join(tempDatasetPath, 'con.txt'), 'input title\nA B\n1 2\n', 'utf-8');
        fs.writeFileSync(path.join(tempDatasetPath, 'recall.rec'), 'recall input\n', 'utf-8');
        fs.writeFileSync(path.join(tempDatasetPath, 'summary.csv'), 'day,flow\n1,2.5\n', 'utf-8');
        fs.writeFileSync(path.join(tempDatasetPath, 'basin_wb.out'), 'Basin output\nDAY FLOW\n1 2.5\n', 'utf-8');
        fs.writeFileSync(path.join(tempDatasetPath, 'yield.txt'), 'Yield summary\nDAY FLOW\nmm m3/s\n1 2.5\n', 'utf-8');

        const result = generateOutputNotebooks(tempDatasetPath, schema);

        assert.strictEqual(result.scannedOutputFiles.length, 3);
        assert.strictEqual(result.notebookPaths.length, 3);
        assert.ok(result.indexNotebookPath);

        const notebookNames = result.notebookPaths.map(notebookPath => path.basename(notebookPath)).sort();
        assert.deepStrictEqual(notebookNames, [
            'basin_wb.out.ipynb',
            'summary.csv.ipynb',
            'yield.txt.ipynb'
        ]);

        assert.strictEqual(fs.existsSync(path.join(result.outputDir, 'con.txt.ipynb')), false);
        assert.strictEqual(fs.existsSync(path.join(result.outputDir, 'recall.rec.ipynb')), false);
        assert.strictEqual(fs.existsSync(path.join(result.outputDir, 'index.ipynb')), true);

        const notebook = JSON.parse(fs.readFileSync(path.join(result.outputDir, 'yield.txt.ipynb'), 'utf-8')) as {
            cells: Array<{ source: string[] }>;
        };
        const combinedSources = notebook.cells.flatMap(cell => cell.source).join('');
        assert.match(combinedSources, /load_swat_output/);
        assert.match(combinedSources, /looks_like_units_row/);
        assert.match(combinedSources, /Generated notebook for reviewing SWAT\+ output file/);

        const indexNotebook = JSON.parse(fs.readFileSync(result.indexNotebookPath!, 'utf-8')) as {
            cells: Array<{ source: string[] }>;
        };
        const indexSources = indexNotebook.cells.flatMap(cell => cell.source).join('');
        assert.match(indexSources, /SWAT\+ Output Notebook Index/);
        assert.match(indexSources, /\[basin_wb\.out\]\(basin_wb\.out\.ipynb\)/);
        assert.match(indexSources, /summary\.csv/);
        assert.match(indexSources, /yield\.txt/);
    });
});
