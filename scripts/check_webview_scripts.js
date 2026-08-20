#!/usr/bin/env node
'use strict';

/**
 * Syntax-check JavaScript embedded in webview HTML template literals.
 *
 * TypeScript and ESLint do not parse JavaScript inside the HTML strings used by
 * the webview panels. This checker extracts each inline script, replaces host-side
 * `${...}` interpolations with a literal, and asks the current Node runtime to
 * parse the result. Keeping the checker in Node makes the normal npm build path
 * portable across Windows, macOS, Linux, and CI.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const scriptBlock = /<script(?:\s+nonce="\$\{nonce\}")?\s*>([\s\S]*?)<\/script>/g;
// One nested brace level covers the interpolations currently used in templates,
// including `${JSON.stringify({...})}`.
const interpolation = /\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;

function checkFile(filePath) {
    const failures = [];
    const sourceText = fs.readFileSync(filePath, 'utf8');
    let match;
    let blockIndex = 0;

    while ((match = scriptBlock.exec(sourceText)) !== null) {
        blockIndex += 1;
        const javascript = match[1].replace(interpolation, 'null');
        if (!javascript.trim()) {
            continue;
        }

        const lineNumber = sourceText.slice(0, match.index).split('\n').length;
        try {
            // Compiling without running the script performs the same syntax parse as
            // `node --check` without spawning another process.
            new vm.Script(javascript, {
                filename: `${path.relative(root, filePath)}#script-${blockIndex}`
            });
        } catch (error) {
            const detail = error instanceof Error ? error.stack || error.message : String(error);
            failures.push(
                `${path.relative(root, filePath)}:${lineNumber} ` +
                `(script block ${blockIndex})\n${detail}`
            );
        }
    }

    return { checked: blockIndex > 0, failures };
}

function main() {
    const failures = [];
    let checked = 0;

    for (const name of fs.readdirSync(src).sort()) {
        if (!name.endsWith('.ts')) {
            continue;
        }
        const result = checkFile(path.join(src, name));
        if (result.checked) {
            checked += 1;
        }
        failures.push(...result.failures);
    }

    if (failures.length > 0) {
        console.error('Embedded webview script syntax errors:\n');
        for (const failure of failures) {
            console.error(failure);
            console.error('');
        }
        return 1;
    }

    console.log(`Embedded webview scripts OK (${checked} file(s) checked).`);
    return 0;
}

process.exitCode = main();
