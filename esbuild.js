const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

const shared = {
	bundle: true,
	format: 'cjs',
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	platform: 'node',
	logLevel: 'silent',
	plugins: [esbuildProblemMatcherPlugin],
};

async function main() {
	const extensionCtx = await esbuild.context({
		...shared,
		entryPoints: ['src/extension.ts'],
		outfile: 'dist/extension.js',
		external: ['vscode'],
	});
	// Standalone MCP server bundle (no vscode dependency). Run with:
	//   node dist/mcp-server.js --index <index.json>
	const mcpCtx = await esbuild.context({
		...shared,
		entryPoints: ['src/mcp/server.ts'],
		outfile: 'dist/mcp-server.js',
		banner: { js: '#!/usr/bin/env node' },
	});
	if (watch) {
		await Promise.all([extensionCtx.watch(), mcpCtx.watch()]);
	} else {
		await Promise.all([extensionCtx.rebuild(), mcpCtx.rebuild()]);
		await Promise.all([extensionCtx.dispose(), mcpCtx.dispose()]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
