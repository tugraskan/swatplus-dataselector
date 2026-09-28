import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CURRENT_INDEX_CACHE_VERSION } from '../indexCacheUtils';
import { resolveMcpServerDatasetArgs, resolveMcpServerDefinitionVersion } from '../mcpServerDefinition';

suite('MCP Server Definition', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swatplus-mcp-test-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    suite('resolveMcpServerDatasetArgs', () => {
        test('no dataset selected -> no arguments (docs-only mode)', () => {
            assert.deepStrictEqual(resolveMcpServerDatasetArgs(undefined), []);
        });

        test('dataset with no index cache -> --dataset', () => {
            assert.deepStrictEqual(resolveMcpServerDatasetArgs(tmpDir), ['--dataset', tmpDir]);
        });

        test('dataset with a current, compatible index cache -> --index', () => {
            const indexPath = path.join(tmpDir, 'index.json');
            fs.writeFileSync(indexPath, JSON.stringify({ version: CURRENT_INDEX_CACHE_VERSION }));
            assert.deepStrictEqual(resolveMcpServerDatasetArgs(tmpDir), ['--index', indexPath]);
        });

        test('dataset with a stale index cache version -> falls back to --dataset', () => {
            fs.writeFileSync(
                path.join(tmpDir, 'index.json'),
                JSON.stringify({ version: CURRENT_INDEX_CACHE_VERSION - 1 })
            );
            assert.deepStrictEqual(resolveMcpServerDatasetArgs(tmpDir), ['--dataset', tmpDir]);
        });

        test('dataset with an unparseable index cache -> falls back to --dataset, does not throw', () => {
            fs.writeFileSync(path.join(tmpDir, 'index.json'), '{ not valid json');
            assert.deepStrictEqual(resolveMcpServerDatasetArgs(tmpDir), ['--dataset', tmpDir]);
        });
    });

    suite('resolveMcpServerDefinitionVersion', () => {
        test('no dataset -> version alone', () => {
            assert.strictEqual(resolveMcpServerDefinitionVersion('1.2.3', undefined), '1.2.3');
        });

        test('a selected dataset changes the version string', () => {
            const withDataset = resolveMcpServerDefinitionVersion('1.2.3', '/data/Ames_sub1');
            assert.strictEqual(withDataset, '1.2.3:/data/Ames_sub1');
            assert.notStrictEqual(withDataset, resolveMcpServerDefinitionVersion('1.2.3', undefined));
        });

        test('switching datasets changes the version string', () => {
            const a = resolveMcpServerDefinitionVersion('1.2.3', '/data/Ames_sub1');
            const b = resolveMcpServerDefinitionVersion('1.2.3', '/data/my_data');
            assert.notStrictEqual(a, b);
        });
    });
});
