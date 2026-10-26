// Copies the repo-root hru_processor.py into python/ so it ships inside the VSIX.
// The root script is the source of truth; python/ is a gitignored build output.
const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '..', '..', 'scripts', 'hru_processor.py');
const targetDir = path.resolve(__dirname, '..', 'python');
const target = path.join(targetDir, 'hru_processor.py');

if (!fs.existsSync(source)) {
	console.error(`hru_processor.py not found at ${source}.`);
	console.error('This extension is built from inside the swatplus-dataselector repo; the script is not forked.');
	process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`copied ${path.relative(process.cwd(), source)} -> ${path.relative(process.cwd(), target)}`);
