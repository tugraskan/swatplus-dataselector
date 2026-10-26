// The HTML shells of the two webviews. The markup is static; the bundled
// scripts (dist/panel.js, dist/picker.js) fill it in. The panel's look is the
// one Dataset Selector's "HRU Subset" panel had: same classes, same VS Code
// theme variables. No vscode import.

import { OPTION_CHOICES } from './options';
import { COLUMNS } from './picker/model';

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function makeNonce(random: () => number = Math.random): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let index = 0; index < 32; index++) {
        nonce += alphabet.charAt(Math.floor(random() * alphabet.length));
    }
    return nonce;
}

export interface HtmlInput {
    nonce: string;
    /** `webview.asWebviewUri(dist/panel.js)` */
    scriptUri: string;
    title: string;
}

function page(input: HtmlInput, css: string, body: string): string {
    const csp = `default-src 'none'; style-src 'nonce-${input.nonce}'; script-src 'nonce-${input.nonce}'; img-src data:;`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(input.title)}</title>
<style nonce="${input.nonce}">${css}</style>
</head>
<body>
${body}
<script nonce="${input.nonce}" src="${escapeHtml(input.scriptUri)}"></script>
</body>
</html>
`;
}

// ---- shared look ------------------------------------------------------------------------

const BASE_CSS = `
:root { --button-padding: 6px 10px; --container-padding: 10px; }
* { box-sizing: border-box; }
body {
    padding: 0;
    margin: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
}
[hidden] { display: none !important; }
.action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: var(--button-padding);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    transition: background-color 0.1s ease;
}
.action-button.primary { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.action-button.primary:hover:not(:disabled) { background-color: var(--vscode-button-hoverBackground); }
.action-button.secondary { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.action-button.secondary:hover:not(:disabled) { background-color: var(--vscode-button-secondaryHoverBackground); }
.action-button.small { font-size: 12px; padding: 4px 8px; }
.action-button:disabled { opacity: 0.5; cursor: not-allowed; }
.action-button:focus-visible, .hru-input:focus-visible, .toggle input:focus-visible + .slider {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
}
.hru-input {
    width: 100%;
    padding: 6px 8px;
    border-radius: 4px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
}
.hru-input:disabled { opacity: 0.6; }
.hru-validation { min-height: 16px; margin-top: 4px; font-size: 11px; color: var(--vscode-errorForeground); }
.hru-validation:empty { min-height: 0; margin-top: 0; }
.hru-warning { margin-top: 6px; font-size: 11px; line-height: 1.4; color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); }
.hru-warning:empty { display: none; }
.hru-panel-meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; line-height: 1.4; word-break: break-word; }
.hru-panel-meta:empty { display: none; }
/* simple toggle switch (as in Dataset Selector) */
.toggle { display: inline-block; position: relative; width: 46px; height: 24px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--vscode-input-background); border-radius: 24px; border: 1px solid var(--vscode-panel-border); }
.toggle .slider:before { content: ''; position: absolute; height: 20px; width: 20px; left: 2px; top: 1px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); border-radius: 50%; transition: transform 0.12s ease; }
.toggle input:checked + .slider { background: var(--vscode-button-background); border-color: var(--vscode-button-hoverBackground); }
.toggle input:checked + .slider:before { transform: translateX(22px); }
.toggle input:disabled + .slider { opacity: 0.5; cursor: not-allowed; }
.spinner { display: inline-block; width: 11px; height: 11px; border: 2px solid var(--vscode-descriptionForeground); border-right-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: -1px; margin-right: 6px; }
@keyframes spin { to { transform: rotate(360deg); } }
`;

// ---- sidebar panel ------------------------------------------------------------------------

const PANEL_CSS = `
.container { padding: var(--container-padding); }
.hru-panel { padding: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background-color: var(--vscode-editor-background); }
.hru-panel-title { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; font-weight: 600; font-size: 12px; margin-bottom: 4px; }
.hru-panel-title .version { font-weight: 400; font-size: 11px; color: var(--vscode-descriptionForeground); }
.hru-panel-description { font-size: 11px; line-height: 1.45; margin-bottom: 8px; }
.hru-field-label { display: block; font-size: 11px; font-weight: 600; margin: 10px 0 4px; }
.hru-field-label:first-of-type { margin-top: 4px; }
.button-row { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.button-row .action-button { flex: 1 1 auto; }
.input-row { display: flex; gap: 6px; align-items: stretch; }
.input-row .action-button { flex: 0 0 auto; white-space: nowrap; }
.options { margin-top: 10px; padding-top: 4px; border-top: 1px dashed var(--vscode-panel-border); }
.option { margin-top: 8px; }
.option-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.option-label { font-size: 12px; font-weight: 600; }
.option-label .tag { font-weight: 400; color: var(--vscode-descriptionForeground); margin-left: 4px; }
.option.switch .option-head { margin-bottom: 2px; }
.option-check { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
.option-check.disabled { opacity: 0.55; cursor: not-allowed; }
.option-help { font-size: 11px; line-height: 1.4; color: var(--vscode-descriptionForeground); margin: 2px 0 0 22px; }
.option.switch .option-help { margin-left: 0; }
.preview { margin-top: 10px; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; font-size: 11px; line-height: 1.45; }
.preview-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px; font-weight: 600; font-size: 12px; }
.preview .muted, .results .muted { color: var(--vscode-descriptionForeground); }
.summary-line { margin-top: 4px; word-break: break-word; }
.summary-label { font-weight: 600; }
.added-list { margin: 4px 0 0; padding-left: 16px; }
.added-list li { margin: 2px 0; word-break: break-word; }
.error-text { color: var(--vscode-errorForeground); white-space: pre-wrap; word-break: break-word; }
.warn-text { color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); margin-top: 4px; word-break: break-word; }
.output-block { margin-top: 10px; }
.create-row { margin-top: 12px; display: flex; gap: 6px; }
.create-row .action-button { flex: 1; }
.results { margin-top: 12px; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; font-size: 11px; line-height: 1.45; }
.results.failed { border-color: var(--vscode-errorForeground); }
.results.done { border-color: var(--vscode-testing-iconPassed, var(--vscode-panel-border)); }
.results h3 { margin: 0 0 4px; font-size: 12px; }
.path { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; word-break: break-all; }
.python-line { margin-top: 10px; font-size: 11px; color: var(--vscode-descriptionForeground); word-break: break-word; }
`;

/** The ids the panel script looks up. The HTML below must contain each; a test checks it. */
export const PANEL_ELEMENT_IDS = [
    'datasetInput', 'browseDataset', 'useSelector', 'datasetError', 'datasetWarning', 'datasetNote', 'datasetResolved', 'rangeLine',
    'idsInput', 'pickHrus', 'idsError',
    'previewBox', 'previewBody', 'previewBtn',
    'outputInput', 'browseOutput', 'outputError', 'outputNote',
    'createBtn', 'cancelBtn', 'results', 'pythonLine', 'version'
] as const;

function optionControl(choice: (typeof OPTION_CHOICES)[number]): string {
    const flagTitle = escapeHtml(`Command line: ${choice.flag} is passed when this is ${choice.flagWhen === 'on' ? 'on' : 'off'}`);
    const tag = choice.tag ? `<span class="tag">${escapeHtml(choice.tag)}</span>` : '';
    const help = `<div class="option-help">${escapeHtml(choice.help)}</div>`;
    if (choice.key === 'keepRouting') {
        return `<div class="option switch" data-option-row="${choice.key}">
    <div class="option-head">
        <span class="option-label">${escapeHtml(choice.label)}</span>
        <label class="toggle" title="${flagTitle}"><input type="checkbox" data-option="${choice.key}" id="opt-${choice.key}"><span class="slider"></span></label>
    </div>
    ${help}
</div>`;
    }
    return `<div class="option" data-option-row="${choice.key}">
    <label class="option-check" title="${flagTitle}">
        <input type="checkbox" data-option="${choice.key}" id="opt-${choice.key}">
        <span class="option-label">${escapeHtml(choice.label)}${tag}</span>
    </label>
    ${help}
</div>`;
}

export function panelHtml(input: HtmlInput): string {
    const options = OPTION_CHOICES.map(optionControl).join('\n');
    const body = `<div class="container">
<div class="hru-panel">
    <div class="hru-panel-title"><span>SWAT+ HRU Subset</span><span class="version" id="version"></span></div>
    <div class="hru-panel-description" title="The dataset is copied first, then the copy is filtered. The dataset itself is never edited.">
        Create a copied TxtInOut folder that keeps only the HRUs you choose. The dataset itself is never changed.
    </div>

    <label class="hru-field-label" for="datasetInput">Dataset</label>
    <input class="hru-input" id="datasetInput" type="text" spellcheck="false" placeholder="Folder with file.cio (or its parent)" title="The dataset folder: the one with file.cio, or its parent when the files are in a TxtInOut subfolder.">
    <div class="button-row">
        <button class="action-button secondary small" id="browseDataset" title="Pick the dataset folder">Browse…</button>
        <button class="action-button secondary small" id="useSelector" hidden title="Use the dataset selected in SWAT+ Dataset Selector">Use Dataset Selector's dataset</button>
    </div>
    <div class="hru-validation" id="datasetError"></div>
    <div class="hru-warning" id="datasetWarning"></div>
    <div class="hru-panel-meta" id="datasetNote"></div>
    <div class="hru-panel-meta" id="datasetResolved"></div>
    <div class="hru-panel-meta" id="rangeLine" title="Detected from hru.con in the dataset."></div>

    <label class="hru-field-label" for="idsInput" title="One HRU ID, a comma-separated list, or inclusive ranges.">HRU IDs</label>
    <div class="input-row">
        <input class="hru-input" id="idsInput" type="text" spellcheck="false" placeholder="1,4-6,10" title="Examples: 7 or 1,4-6,10">
        <button class="action-button secondary small" id="pickHrus" title="Open a table of every HRU in the dataset and pick from it">Pick HRUs…</button>
    </div>
    <div class="hru-validation" id="idsError"></div>

    <div class="options">
${options}
    </div>

    <div class="preview" id="previewBox" hidden>
        <div class="preview-head"><span>Preview</span><button class="action-button secondary small" id="previewBtn" title="Ask the script what these settings would keep and add. Nothing is written.">Refresh</button></div>
        <div id="previewBody"></div>
    </div>

    <div class="output-block">
        <label class="hru-field-label" for="outputInput" title="A new folder, never inside the dataset.">Output folder</label>
        <input class="hru-input" id="outputInput" type="text" spellcheck="false" title="The subset is created here. It must not be inside the dataset folder.">
        <div class="button-row"><button class="action-button secondary small" id="browseOutput" title="Pick the folder to create the subset in">Browse…</button></div>
        <div class="hru-validation" id="outputError"></div>
        <div class="hru-panel-meta" id="outputNote"></div>
    </div>

    <div class="create-row">
        <button class="action-button primary" id="createBtn" title="Create a reduced TxtInOut folder for the HRUs above">Create Subset</button>
        <button class="action-button secondary" id="cancelBtn" hidden>Cancel</button>
    </div>
    <div id="results" hidden></div>
    <div class="python-line" id="pythonLine"></div>
</div>
</div>`;
    return page(input, BASE_CSS + PANEL_CSS, body);
}

// ---- picker tab ---------------------------------------------------------------------------

const PICKER_CSS = `
body { background-color: var(--vscode-editor-background); height: 100vh; overflow: hidden; }
.picker { display: flex; flex-direction: column; height: 100vh; }
.toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
.toolbar .hru-input { width: 260px; }
.toolbar .spacer { flex: 1 1 auto; }
.statusbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 6px 10px; font-size: 12px; border-bottom: 1px solid var(--vscode-panel-border); }
.statusbar .muted { color: var(--vscode-descriptionForeground); }
.statusbar .flash { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); }
#scroller { position: relative; flex: 1 1 auto; overflow: auto; outline: none; }
#header { position: sticky; top: 0; z-index: 2; display: flex; height: 26px; background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background)); border-bottom: 1px solid var(--vscode-panel-border); }
.cell { flex: 0 0 auto; padding: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 24px; }
.cell.right { text-align: right; }
.cell.center { text-align: center; }
.hcell { cursor: pointer; user-select: none; font-weight: 600; line-height: 26px; }
.hcell:hover { background: var(--vscode-list-hoverBackground); }
.hcell .arrow { margin-left: 4px; opacity: 0.8; }
#body { position: relative; }
.row { position: absolute; left: 0; display: flex; height: 24px; cursor: default; font-size: 12px; user-select: none; }
.row:hover { background: var(--vscode-list-hoverBackground); }
.row.selected { background: var(--vscode-list-inactiveSelectionBackground); }
.row.selected.focus { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.row.focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.empty { padding: 20px; color: var(--vscode-descriptionForeground); }
.notice { padding: 6px 10px; font-size: 11px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--vscode-panel-border); }
.notice:empty { display: none; }
.error-text { padding: 20px; color: var(--vscode-errorForeground); white-space: pre-wrap; }
`;

export const PICKER_ELEMENT_IDS = [
    'filterInput', 'selectShown', 'clearBtn', 'selectRu', 'selectSubbasin', 'useBtn',
    'selectionLine', 'flash', 'scroller', 'header', 'body', 'message', 'notice'
] as const;

export function pickerHtml(input: HtmlInput): string {
    const widths = COLUMNS.reduce((sum, column) => sum + column.width, 0);
    const body = `<div class="picker">
    <div class="toolbar">
        <input class="hru-input" id="filterInput" type="text" spellcheck="false" placeholder="Filter: land use, routing unit, 'wetland', 'upstream'…" title="Rows must contain every word you type (any column).">
        <button class="action-button secondary small" id="selectShown" title="Add every row that matches the filter to the selection">Select all shown</button>
        <button class="action-button secondary small" id="selectRu" disabled title="Add every HRU of the routing unit of the row you clicked last">Routing unit</button>
        <button class="action-button secondary small" id="selectSubbasin" disabled title="Add every HRU of the subbasin of the row you clicked last">Subbasin</button>
        <button class="action-button secondary small" id="clearBtn" title="Clear the selection">Clear</button>
        <span class="spacer"></span>
        <button class="action-button primary" id="useBtn" disabled title="Write the selected IDs into the HRU IDs box of the SWAT+ HRU Subset panel">Use selection</button>
    </div>
    <div class="statusbar"><span id="selectionLine">Loading…</span><span class="flash" id="flash"></span><span class="muted">Click selects, Ctrl+click toggles, Shift+click extends. Ctrl+A selects all shown.</span></div>
    <div id="scroller" tabindex="0">
        <div id="header" style="min-width:${widths}px"></div>
        <div id="body" style="min-width:${widths}px"></div>
        <div class="empty" id="message" hidden></div>
    </div>
    <div class="notice" id="notice"></div>
</div>`;
    return page(input, BASE_CSS + PICKER_CSS, body);
}
