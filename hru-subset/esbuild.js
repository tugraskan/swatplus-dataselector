const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// The extension host (Node) and the two webview scripts (browser). The webview
// scripts import pure modules from src/, so they are bundled too.
const shared = {
	bundle: true,
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	logLevel: 'info',
};

const targets = [
	{
		...shared,
		entryPoints: ['src/extension.ts'],
		outfile: 'dist/extension.js',
		format: 'cjs',
		platform: 'node',
		external: ['vscode'],
	},
	{
		...shared,
		entryPoints: { panel: 'src/browser/panel.ts', picker: 'src/browser/picker.ts' },
		outdir: 'dist',
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
	},
];

async function main() {
	const contexts = await Promise.all(targets.map(target => esbuild.context(target)));
	if (watch) {
		await Promise.all(contexts.map(ctx => ctx.watch()));
	} else {
		await Promise.all(contexts.map(ctx => ctx.rebuild()));
		await Promise.all(contexts.map(ctx => ctx.dispose()));
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
