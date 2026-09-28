/**
 * Pure logic for the MCP stdio server definition VS Code spawns automatically
 * for `dist/mcp-server.js`.
 *
 * Kept `vscode`-free and separate from `extension.ts` so it is unit testable
 * without a `vscode` mock, the same separation `datasetEngineCore.ts` and
 * `enrichedSchemaCore.ts` already use for engine logic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isIndexCacheCompatible } from './indexCacheUtils';

/**
 * Builds the `--index` / `--dataset` arguments for `dist/mcp-server.js` from
 * the currently selected dataset, if any.
 *
 * An existing, version-compatible `index.json` next to the dataset (written
 * by the extension's own indexer) is reused directly rather than asking the
 * server to rebuild it -- rebuilding needs `python3` + `pandas` on `PATH`,
 * which is not guaranteed, and the extension's own cache, when present and
 * current, already has everything the server needs. Without a selected
 * dataset, or with a cache that fails the version check or fails to parse, no
 * dataset flag is passed and the server runs in docs-only mode (see
 * docs/MCP_SERVER.md) rather than guessing at a state that was not verified.
 */
export function resolveMcpServerDatasetArgs(datasetPath: string | undefined): string[] {
    if (!datasetPath) {
        return [];
    }

    const indexPath = path.join(datasetPath, 'index.json');
    if (fs.existsSync(indexPath)) {
        try {
            const payload = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
            if (isIndexCacheCompatible(payload?.version)) {
                return ['--index', indexPath];
            }
        } catch {
            // Falls through to --dataset: an unreadable or malformed cache
            // should not stop the server from working, only skip reusing it.
        }
    }

    return ['--dataset', datasetPath];
}

/**
 * The `version` string passed to `McpStdioServerDefinition`. VS Code prompts
 * to refresh a client's tool list when this changes between calls to
 * `provideMcpServerDefinitions`, so it must change whenever the arguments the
 * server would be spawned with change -- switching datasets in particular,
 * since that changes which tools have data to answer with.
 */
export function resolveMcpServerDefinitionVersion(
    extensionVersion: string,
    datasetPath: string | undefined
): string {
    return datasetPath ? `${extensionVersion}:${datasetPath}` : extensionVersion;
}
