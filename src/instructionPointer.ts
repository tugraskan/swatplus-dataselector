// Writes a pointer to this extension's tools into the workspace's assistant
// instruction files, the same way Tamandua's `swatplus-build --markdown`
// does for its own index -- availability alone doesn't get tools used, an
// explicit "prefer these" line does. Marker-delimited so re-running (every
// activation) is a safe no-op once the section is current, and existing
// content outside the markers is left alone.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const MARKER = '<!-- swat-dataselector-index -->';

const POINTER_FILES = ['CLAUDE.md', 'AGENTS.md', path.join('.github', 'copilot-instructions.md')];

function pointerText(): string {
	return `${MARKER}
## SWAT+ Dataset Selector

This workspace has the **SWAT+ Dataset Selector** extension installed. It
indexes a SWAT+ dataset (TxtInOut folder) and exposes it through one shared
tool set -- in-editor as the \`@swat\` chat participant, and to external agents
(Claude Code, Claude Desktop) via its bundled MCP server (\`docs/MCP_SERVER.md\`
in the extension repo).

Prefer these tools over grepping input files by hand:

| Tool | Use it to |
|---|---|
| \`describe_entity\` | Full description of an HRU/aquifer/channel/etc: values, meanings, FK connections, incoming references |
| \`find_references\` | Reverse lookup -- what references this entity |
| \`lookup_docs\` | A file or column's documented meaning, units, type, default (works with no dataset loaded) |
| \`list_entities\` | Ids/names available in an entity table, to discover what to describe |
| \`query_rows\` | Rows matching column predicates |
| \`find_orphans\` | Rows nothing references -- unused/dead data |
${MARKER}`;
}

function installPointerFile(target: string): void {
	const text = pointerText();
	if (!fs.existsSync(target)) {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, text + '\n', 'utf-8');
		return;
	}

	const existing = fs.readFileSync(target, 'utf-8');
	const start = existing.indexOf(MARKER);
	if (start !== -1) {
		const end = existing.indexOf(MARKER, start + MARKER.length) + MARKER.length;
		const updated = existing.slice(0, start) + text + existing.slice(end);
		if (updated !== existing) {
			fs.writeFileSync(target, updated, 'utf-8');
		}
		return;
	}

	const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
	fs.writeFileSync(target, existing + sep + text + '\n', 'utf-8');
}

/** Called on activation, for every open workspace folder. Never throws. */
export function installInstructionPointers(): void {
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		for (const name of POINTER_FILES) {
			try {
				installPointerFile(path.join(folder.uri.fsPath, name));
			} catch (err) {
				console.error(`SWAT+ Dataset Selector: failed to write ${name}`, err);
			}
		}
	}
}
