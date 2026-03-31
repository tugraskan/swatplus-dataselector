import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseOutputFileToDataFrame, type ParsedOutputDataFrame } from './outputDataFrameUtils';

export class SwatOutputDataFramePanel {
    private static panels = new Map<string, SwatOutputDataFramePanel>();
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, private readonly filePath: string) {
        this.panel = panel;
        this.update();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static createOrShow(filePath: string): void {
        const resolvedPath = path.resolve(filePath);
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
        const existing = SwatOutputDataFramePanel.panels.get(resolvedPath);
        if (existing) {
            existing.panel.reveal(column);
            existing.update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'swatOutputExplorer',
            `SWAT+ Output Explorer: ${path.basename(resolvedPath)}`,
            column,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        const instance = new SwatOutputDataFramePanel(panel, resolvedPath);
        SwatOutputDataFramePanel.panels.set(resolvedPath, instance);
    }

    private dispose(): void {
        SwatOutputDataFramePanel.panels.delete(this.filePath);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private update(): void {
        try {
            const parsed = parseOutputFileToDataFrame(this.filePath);
            this.panel.webview.html = this.getHtml(parsed);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.panel.webview.html = this.getErrorHtml(message);
        }
    }

    private getHtml(parsed: ParsedOutputDataFrame): string {
        const nonce = crypto.randomBytes(16).toString('base64');
        const summary = parsed.truncated
            ? `Previewing ${parsed.previewRowCount.toLocaleString()} of ${parsed.totalRowCount.toLocaleString()} rows`
            : `${parsed.totalRowCount.toLocaleString()} rows loaded`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(parsed.fileName)}</title>
    <style>
        :root { color-scheme: light dark; --bg:#f4efe4; --panel:rgba(255,251,243,.92); --ink:#1d2430; --muted:#677182; --line:rgba(29,36,48,.12); --accent:#0f766e; --accentSoft:rgba(15,118,110,.12); --header:#ece0c6; --units:#f5eddc; }
        @media (prefers-color-scheme: dark) { :root { --bg:#0f151c; --panel:rgba(20,27,38,.94); --ink:#edf2f7; --muted:#aab4c3; --line:rgba(237,242,247,.1); --accent:#78d7ca; --accentSoft:rgba(120,215,202,.12); --header:#182231; --units:#13202d; } }
        * { box-sizing:border-box; }
        body { margin:0; padding:16px; background:radial-gradient(circle at top left,var(--accentSoft),transparent 34%),linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--bg) 84%,black 16%)); color:var(--ink); font-family:Georgia,"Palatino Linotype",serif; }
        .shell { max-width:1580px; margin:0 auto; border:1px solid var(--line); border-radius:20px; overflow:hidden; background:var(--panel); box-shadow:0 24px 60px rgba(0,0,0,.15); }
        .hero { padding:22px 24px 16px; border-bottom:1px solid var(--line); }
        h1 { margin:0; font-size:30px; line-height:1.05; }
        .sub,.path,.status,.note { color:var(--muted); }
        .sub { margin-top:8px; font-size:14px; }
        .path { margin-top:12px; font-family:Consolas,"Courier New",monospace; word-break:break-all; }
        .chips { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
        .chip { padding:6px 10px; border:1px solid color-mix(in srgb,var(--accent) 30%,transparent); border-radius:999px; background:var(--accentSoft); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
        .layout { display:grid; grid-template-columns:340px minmax(0,1fr); }
        .side { padding:18px; border-right:1px solid var(--line); display:grid; gap:14px; align-content:start; }
        .box,.field { border:1px solid var(--line); border-radius:16px; background:color-mix(in srgb,var(--panel) 92%,transparent); padding:14px; }
        .metric { font-size:24px; line-height:1; }
        .label { margin-top:6px; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.07em; }
        .main { display:grid; grid-template-rows:auto auto 1fr; min-width:0; }
        .controls { padding:18px; display:grid; gap:10px; border-bottom:1px solid var(--line); }
        .row { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
        .field label { display:block; margin-bottom:8px; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.07em; }
        .field input,.field select,.field button { width:100%; padding:10px 11px; border-radius:12px; border:1px solid var(--line); background:color-mix(in srgb,var(--panel) 88%,transparent); color:var(--ink); font:inherit; }
        .field button { cursor:pointer; background:linear-gradient(180deg,var(--accentSoft),transparent); }
        .wide { grid-column:1 / -1; }
        .builderHead { display:flex; justify-content:space-between; gap:12px; align-items:center; }
        .builderActions { display:flex; gap:8px; }
        .builderActions button { width:auto; }
        .hint { color:var(--muted); font-size:12px; line-height:1.4; }
        .conditionList { display:grid; gap:10px; margin-top:12px; }
        .conditionRow { display:grid; grid-template-columns:88px 96px 86px 1.35fr 1fr 1.5fr 44px; gap:8px; align-items:center; }
        .conditionRow select,.conditionRow input,.conditionRow button { width:100%; padding:10px 11px; border-radius:12px; border:1px solid var(--line); background:color-mix(in srgb,var(--panel) 88%,transparent); color:var(--ink); font:inherit; }
        .conditionRow button { cursor:pointer; }
        .conditionLabel,.notToggle { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.07em; }
        .notToggle { display:flex; align-items:center; gap:6px; }
        .chart { min-height:320px; border-radius:14px; border:1px solid var(--line); background:linear-gradient(180deg,var(--accentSoft),transparent); overflow:hidden; display:grid; place-items:center; }
        .chart svg { width:100%; height:100%; display:block; }
        .tableBar { padding:14px 18px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:12px; align-items:center; }
        .tableWrap { overflow:auto; max-height:calc(100vh - 270px); padding:0 8px 10px; }
        table { width:100%; min-width:860px; border-collapse:separate; border-spacing:0; font-family:Consolas,"Courier New",monospace; font-size:12px; }
        th,td { padding:8px 10px; white-space:nowrap; border-right:1px solid var(--line); border-bottom:1px solid var(--line); }
        thead th { position:sticky; top:0; z-index:3; background:var(--header); }
        th:first-child,td:first-child { position:sticky; left:0; z-index:1; background:var(--panel); }
        thead th:first-child { z-index:4; background:var(--header); }
        tbody tr:nth-child(even) td { background:color-mix(in srgb,var(--panel) 90%,black 10%); }
        .rowIndex { min-width:56px; text-align:right; color:var(--muted); }
        .sortBtn { appearance:none; border:0; background:transparent; color:inherit; font:inherit; cursor:pointer; padding:0; width:100%; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; text-align:left; }
        .headText { display:flex; flex-direction:column; gap:2px; min-width:0; }
        .headTitle { font-weight:600; }
        .headUnit { color:var(--muted); font-size:11px; font-weight:normal; }
        .glyph { color:var(--accent); font-size:11px; }
        .empty { padding:26px; text-align:center; color:var(--muted); }
        @media (max-width:1120px) { .layout { grid-template-columns:1fr; } .side { border-right:0; border-bottom:1px solid var(--line); } .row { grid-template-columns:1fr 1fr; } .conditionRow { grid-template-columns:1fr 1fr; } }
        @media (max-width:720px) { body { padding:8px; } .row { grid-template-columns:1fr; } .tableWrap { max-height:none; } }
    </style>
</head>
<body>
    <div class="shell">
        <div class="hero">
            <h1>${escapeHtml(parsed.title)}</h1>
            <div class="sub">Search, sort, filter, and chart output files directly in VS Code.</div>
            <div class="chips">
                <span class="chip">${escapeHtml(parsed.fileName)}</span>
                <span class="chip">${escapeHtml(parsed.parserKind)}</span>
                <span class="chip">${escapeHtml(summary)}</span>
                <span class="chip">${parsed.columns.length.toLocaleString()} columns</span>
            </div>
            <div class="path">${escapeHtml(parsed.filePath)}</div>
        </div>
        <div class="layout">
            <aside class="side">
                <div class="box"><div class="metric" id="visibleCount">0</div><div class="label">Visible Rows</div></div>
                <div class="box"><div class="metric" id="numericCount">0</div><div class="label">Numeric Columns</div></div>
                <div class="box"><div class="metric" id="chartCount">0</div><div class="label">Chart Points</div></div>
                <div class="box">
                    <div class="label" style="margin-top:0;margin-bottom:8px;">Chart</div>
                    <div class="status" id="chartStatus">Choose axes to inspect trends.</div>
                    <div class="chart">
                        <div class="empty" id="chartEmpty">A numeric Y column is required before a chart can be drawn.</div>
                        <svg id="chartSvg" viewBox="0 0 960 360" aria-label="Output chart"></svg>
                    </div>
                </div>
                <div class="box"><div class="label" style="margin-top:0;margin-bottom:8px;">Notes</div><div class="note">${parsed.truncated ? 'The explorer is using a preview subset for interactivity.' : 'The full file is loaded into the explorer.'} Build filters like <code>unit = 4</code>, <code>plantnm IN corn,soyb</code>, or <code>yr >= 2020</code>.</div></div>
            </aside>
            <main class="main">
                <section class="controls">
                    <div class="field wide">
                        <label>Query Builder</label>
                        <div class="builderHead">
                            <div class="hint">Use dropdowns for columns and operators, then add conditions with AND / OR / NOT, including IN and NOT IN.</div>
                            <div class="builderActions">
                                <button id="addCondition" type="button">+ Condition</button>
                                <button id="clearConditions" type="button">Clear Filters</button>
                            </div>
                        </div>
                        <div id="conditionList" class="conditionList"></div>
                    </div>
                    <div class="row">
                        <div class="field"><label for="chartType">Chart type</label><select id="chartType"><option value="line">Line</option><option value="scatter">Scatter</option><option value="bar">Bar</option></select></div>
                        <div class="field"><label for="xColumn">X axis</label><select id="xColumn"></select></div>
                        <div class="field"><label for="yColumn">Y axis</label><select id="yColumn"></select></div>
                        <div class="field"><label for="rowLimit">Chart points</label><select id="rowLimit"><option value="40">40</option><option value="80" selected>80</option><option value="160">160</option><option value="320">320</option></select></div>
                    </div>
                </section>
                <section class="tableBar"><div class="status" id="tableStatus">Preparing rows...</div><div class="status" id="sortStatus">Click a column header to sort.</div></section>
                <section class="tableWrap">
                    <table><thead id="tableHead"></thead><tbody id="tableBody"></tbody></table>
                    <div class="empty" id="emptyState" hidden>No rows match the current filters.</div>
                </section>
            </main>
        </div>
    </div>
    <script nonce="${nonce}">
${this.getScript(parsed)}
    </script>
</body>
</html>`;
    }

    private getScript(parsed: ParsedOutputDataFrame): string {
        const data = serializeForScript(parsed);
        return [
            `const data = ${data};`,
            'const rows = data.rows.map((values, index) => ({ previewRow: index + 1, values }));',
            'const columns = data.columns.slice();',
            'const numericColumns = columns.filter((column, columnIndex) => {',
            '  let nonEmpty = 0; let numeric = 0;',
            '  for (const row of rows) { const value = String(row.values[columnIndex] ?? "").trim(); if (!value) continue; nonEmpty += 1; if (toNumber(value) !== null) numeric += 1; }',
            '  return nonEmpty > 0 && (numeric / nonEmpty) >= 0.6;',
            '});',
            'const conditionOperators = [',
            '  { value: "contains", label: "contains", needsValue: true },',
            '  { value: "equals", label: "equals", needsValue: true },',
            '  { value: "gt", label: ">", needsValue: true },',
            '  { value: "gte", label: ">=", needsValue: true },',
            '  { value: "lt", label: "<", needsValue: true },',
            '  { value: "lte", label: "<=", needsValue: true },',
            '  { value: "in", label: "IN", needsValue: true },',
            '  { value: "is_empty", label: "is empty", needsValue: false }',
            '];',
            'const operatorConfig = Object.fromEntries(conditionOperators.map(operator => [operator.value, operator]));',
            'let nextConditionId = 1;',
            'const state = { conditions: [createCondition()], sortColumn: "", sortDirection: "asc", chartType: "line", xColumn: columns[0] || "__previewRow", yColumn: numericColumns[0] || "", rowLimit: 80 };',
            'const el = {',
            '  conditionList: document.getElementById("conditionList"), addCondition: document.getElementById("addCondition"), clearConditions: document.getElementById("clearConditions"),',
            '  chartType: document.getElementById("chartType"), xColumn: document.getElementById("xColumn"), yColumn: document.getElementById("yColumn"), rowLimit: document.getElementById("rowLimit"),',
            '  visibleCount: document.getElementById("visibleCount"), numericCount: document.getElementById("numericCount"), chartCount: document.getElementById("chartCount"), chartStatus: document.getElementById("chartStatus"), chartEmpty: document.getElementById("chartEmpty"), chartSvg: document.getElementById("chartSvg"),',
            '  tableStatus: document.getElementById("tableStatus"), sortStatus: document.getElementById("sortStatus"), tableHead: document.getElementById("tableHead"), tableBody: document.getElementById("tableBody"), emptyState: document.getElementById("emptyState")',
            '};',
            'el.numericCount.textContent = numericColumns.length.toLocaleString();',
            'refreshSelects(); wireEvents(); render();',
            'function createCondition(overrides = {}) { return { id: nextConditionId++, join: "and", not: false, column: "", operator: "contains", value: "", ...overrides }; }',
            'function wireEvents() {',
            '  el.addCondition.addEventListener("click", () => { const lastCondition = state.conditions[state.conditions.length - 1]; state.conditions.push(createCondition({ join: "and", column: lastCondition?.column || "", operator: lastCondition?.operator || "contains" })); render(); });',
            '  el.clearConditions.addEventListener("click", () => { state.conditions = [createCondition()]; render(); });',
            '  el.conditionList.addEventListener("change", event => { const target = event.target; if (!(target instanceof HTMLElement)) return; const row = target.closest("[data-condition-id]"); if (!(row instanceof HTMLElement)) return; const conditionId = Number(row.getAttribute("data-condition-id")); const condition = state.conditions.find(item => item.id === conditionId); if (!condition) return; const role = target.getAttribute("data-role"); if (role === "join" && target instanceof HTMLSelectElement) { condition.join = target.value === "or" ? "or" : "and"; renderResults(); return; } if (role === "not" && target instanceof HTMLInputElement) { condition.not = target.checked; renderResults(); return; } if (role === "column" && target instanceof HTMLSelectElement) { condition.column = target.value || ""; renderResults(); return; } if (role === "operator" && target instanceof HTMLSelectElement) { condition.operator = target.value || "contains"; if (!operatorConfig[condition.operator]?.needsValue) { condition.value = ""; } render(); } });',
            '  el.conditionList.addEventListener("input", event => { const target = event.target; if (!(target instanceof HTMLInputElement)) return; if (target.getAttribute("data-role") !== "value") return; const row = target.closest("[data-condition-id]"); if (!(row instanceof HTMLElement)) return; const conditionId = Number(row.getAttribute("data-condition-id")); const condition = state.conditions.find(item => item.id === conditionId); if (!condition) return; condition.value = target.value || ""; renderResults(); });',
            '  el.conditionList.addEventListener("click", event => { const target = event.target; if (!(target instanceof HTMLElement)) return; const button = target.closest("button[data-role=\\"remove\\"]"); if (!(button instanceof HTMLButtonElement)) return; const row = button.closest("[data-condition-id]"); if (!(row instanceof HTMLElement)) return; const conditionId = Number(row.getAttribute("data-condition-id")); if (state.conditions.length === 1) { state.conditions = [createCondition()]; } else { state.conditions = state.conditions.filter(item => item.id !== conditionId); } render(); });',
            '  el.chartType.addEventListener("change", event => { state.chartType = event.target.value || "line"; renderChart(getVisibleRows()); });',
            '  el.xColumn.addEventListener("change", event => { state.xColumn = event.target.value || "__previewRow"; renderChart(getVisibleRows()); });',
            '  el.yColumn.addEventListener("change", event => { state.yColumn = event.target.value || ""; renderChart(getVisibleRows()); });',
            '  el.rowLimit.addEventListener("change", event => { state.rowLimit = Number(event.target.value) || 80; renderChart(getVisibleRows()); });',
            '  el.tableHead.addEventListener("click", event => { const target = event.target.closest("button[data-column]"); if (!target) return; const column = target.getAttribute("data-column") || ""; if (!column) return; if (state.sortColumn === column) { state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc"; } else { state.sortColumn = column; state.sortDirection = "asc"; } renderResults(); });',
            '  window.addEventListener("resize", () => renderChart(getVisibleRows()));',
            '}',
            'function refreshSelects() {',
            '  if (state.xColumn !== "__previewRow" && !columns.includes(state.xColumn)) state.xColumn = columns[0] || "__previewRow";',
            '  if (state.yColumn && !numericColumns.includes(state.yColumn)) state.yColumn = numericColumns[0] || "";',
            '  fillSelect(el.xColumn, [{ value: "__previewRow", label: "Preview row" }, ...columns.map(column => ({ value: column, label: column }))], state.xColumn);',
            '  fillSelect(el.yColumn, numericColumns.length ? numericColumns.map(column => ({ value: column, label: column })) : [{ value: "", label: "No numeric columns" }], state.yColumn);',
            '}',
            'function fillSelect(node, options, selectedValue) { node.innerHTML = options.map(option => `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join(""); }',
            'function render() { refreshSelects(); renderConditionBuilder(); renderResults(); }',
            'function renderConditionBuilder() {',
            '  if (!state.conditions.length) state.conditions = [createCondition()];',
            '  el.conditionList.innerHTML = state.conditions.map((condition, index) => {',
            '    const requiresValue = operatorConfig[condition.operator]?.needsValue !== false;',
            '    const joinOptions = [{ value: "and", label: "AND" }, { value: "or", label: "OR" }];',
            '    const columnOptions = [{ value: "", label: "Choose column" }, ...columns.map(column => ({ value: column, label: column }))];',
            '    const joinMarkup = joinOptions.map(option => `<option value="${escapeHtml(option.value)}"${option.value === condition.join ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");',
            '    const columnMarkup = columnOptions.map(option => `<option value="${escapeHtml(option.value)}"${option.value === condition.column ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");',
            '    const operatorMarkup = conditionOperators.map(option => `<option value="${escapeHtml(option.value)}"${option.value === condition.operator ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");',
            '    return `<div class="conditionRow" data-condition-id="${condition.id}"><span class="conditionLabel">${index === 0 ? "Where" : "Join"}</span><select data-role="join"${index === 0 ? " disabled" : ""}>${joinMarkup}</select><label class="notToggle"><input data-role="not" type="checkbox"${condition.not ? " checked" : ""}>NOT</label><select data-role="column">${columnMarkup}</select><select data-role="operator">${operatorMarkup}</select><input data-role="value" type="text" value="${escapeHtml(condition.value || "")}" placeholder="${escapeHtml(getConditionPlaceholder(condition.operator))}"${requiresValue ? "" : " disabled"}><button type="button" data-role="remove" aria-label="Remove condition">x</button></div>`;',
            '  }).join("");',
            '}',
            'function getConditionPlaceholder(operator) { if (operator === "in") return "comma-separated values"; if (operator === "contains") return "text to match"; if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") return "numeric value"; if (operator === "is_empty") return "no value needed"; return "value"; }',
            'function renderResults() { const visibleRows = getVisibleRows(); renderTable(visibleRows); renderChart(visibleRows); el.visibleCount.textContent = visibleRows.length.toLocaleString(); const previewCount = rows.length.toLocaleString(); const fileCount = data.totalRowCount.toLocaleString(); const activeCount = state.conditions.filter(isConditionActive).length; const filterText = activeCount ? `${activeCount} active condition${activeCount === 1 ? "" : "s"}` : "No active filters"; el.tableStatus.textContent = data.truncated ? `Visible ${visibleRows.length.toLocaleString()} of ${previewCount} preview rows (${fileCount} in file). ${filterText}.` : `Visible ${visibleRows.length.toLocaleString()} of ${previewCount} rows. ${filterText}.`; el.sortStatus.textContent = state.sortColumn ? `Sorted by ${state.sortColumn} (${state.sortDirection})` : "Click a column header to sort."; }',
            'function getVisibleRows() { let visible = rows.filter(row => matchesConditions(row)); if (!state.sortColumn) return visible; const index = columns.indexOf(state.sortColumn); if (index === -1) return visible; const direction = state.sortDirection === "desc" ? -1 : 1; return visible.slice().sort((left, right) => direction * compareValues(left.values[index], right.values[index])); }',
            'function matchesConditions(row) { const activeConditions = state.conditions.filter(isConditionActive); if (!activeConditions.length) return true; let matched = evaluateCondition(row, activeConditions[0]); for (let index = 1; index < activeConditions.length; index += 1) { const condition = activeConditions[index]; const conditionMatched = evaluateCondition(row, condition); matched = condition.join === "or" ? (matched || conditionMatched) : (matched && conditionMatched); } return matched; }',
            'function isConditionActive(condition) { const operator = operatorConfig[condition.operator]; if (!operator || !condition.column) return false; return !operator.needsValue || Boolean(String(condition.value ?? "").trim()); }',
            'function evaluateCondition(row, condition) { const columnIndex = columns.indexOf(condition.column); if (columnIndex === -1) return false; const cellValue = String(row.values[columnIndex] ?? "").trim(); const matched = valuesMatch(cellValue, condition.operator, condition.value); return condition.not ? !matched : matched; }',
            'function valuesMatch(cellValue, operator, rawValue) { const queryValue = String(rawValue ?? "").trim(); if (operator === "is_empty") return !cellValue; if (operator === "contains") return cellValue.toLowerCase().includes(queryValue.toLowerCase()); if (operator === "equals") return equalsValue(cellValue, queryValue); if (operator === "in") { const options = splitListValues(queryValue); return options.some(option => equalsValue(cellValue, option)); } const left = toNumber(cellValue); const right = toNumber(queryValue); if (left === null || right === null) return false; if (operator === "gt") return left > right; if (operator === "gte") return left >= right; if (operator === "lt") return left < right; if (operator === "lte") return left <= right; return false; }',
            'function equalsValue(left, right) { const leftNumber = toNumber(left); const rightNumber = toNumber(right); if (leftNumber !== null && rightNumber !== null) return leftNumber === rightNumber; return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase(); }',
            'function splitListValues(value) { return String(value ?? "").split(/[,;]+/).map(item => item.trim()).filter(Boolean); }',
            'function compareValues(left, right) { const leftNumber = toNumber(left); const rightNumber = toNumber(right); if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber; return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" }); }',
            'function renderTable(visibleRows) { const headers = columns.map((column, index) => { const glyph = state.sortColumn === column ? (state.sortDirection === "asc" ? "ASC" : "DESC") : "SORT"; const unit = Array.isArray(data.units) ? String(data.units[index] ?? "").trim() : ""; const unitMarkup = unit ? `<span class="headUnit">${escapeHtml(unit)}</span>` : ""; return `<th><button type="button" class="sortBtn" data-column="${escapeHtml(column)}"><span class="headText"><span class="headTitle">${escapeHtml(column)}</span>${unitMarkup}</span><span class="glyph">${glyph}</span></button></th>`; }).join(""); el.tableHead.innerHTML = `<tr><th>#</th>${headers}</tr>`; if (!visibleRows.length) { el.tableBody.innerHTML = ""; el.emptyState.hidden = false; return; } el.emptyState.hidden = true; el.tableBody.innerHTML = visibleRows.map(row => `<tr><td class="rowIndex">${row.previewRow}</td>${row.values.map(value => `<td>${escapeHtml(String(value ?? ""))}</td>`).join("")}</tr>`).join(""); }',
            'function renderChart(visibleRows) { if (!state.yColumn) { el.chartEmpty.hidden = false; el.chartSvg.innerHTML = ""; el.chartStatus.textContent = "Choose a numeric Y column to draw a chart."; el.chartCount.textContent = "0"; return; } const yIndex = columns.indexOf(state.yColumn); const xIndex = state.xColumn === "__previewRow" ? -1 : columns.indexOf(state.xColumn); const prepared = visibleRows.map((row, index) => ({ label: xIndex >= 0 ? String(row.values[xIndex] ?? "") : String(row.previewRow), xValue: xIndex >= 0 ? toNumber(row.values[xIndex]) : index, yValue: toNumber(row.values[yIndex]) })).filter(point => point.yValue !== null); if (!prepared.length) { el.chartEmpty.hidden = false; el.chartSvg.innerHTML = ""; el.chartStatus.textContent = `No numeric values found in ${state.yColumn}.`; el.chartCount.textContent = "0"; return; } const sampled = downsample(prepared, state.chartType === "bar" ? Math.min(state.rowLimit, 80) : state.rowLimit); const useNumericX = xIndex >= 0 && sampled.every(point => point.xValue !== null); const points = sampled.map((point, index) => ({ label: point.label, xValue: useNumericX ? point.xValue : index, yValue: point.yValue })); el.chartCount.textContent = points.length.toLocaleString(); el.chartStatus.textContent = `${state.chartType} chart using ${state.xColumn === "__previewRow" ? "preview row" : state.xColumn} vs ${state.yColumn}.`; el.chartEmpty.hidden = true; el.chartSvg.innerHTML = buildSvg(points, useNumericX, state.chartType, state.xColumn === "__previewRow" ? "preview row" : state.xColumn, state.yColumn); }',
            'function downsample(list, limit) { if (list.length <= limit || limit <= 1) return list; const sampled = []; for (let index = 0; index < limit; index += 1) { const sourceIndex = Math.floor((index / (limit - 1)) * (list.length - 1)); sampled.push(list[sourceIndex]); } return sampled; }',
            'function buildSvg(points, useNumericX, chartType, xLabel, yLabel) { const width = 960; const height = 360; const margin = { top: 20, right: 24, bottom: 64, left: 72 }; const innerWidth = width - margin.left - margin.right; const innerHeight = height - margin.top - margin.bottom; const xValues = points.map(point => point.xValue); const yValues = points.map(point => point.yValue); const xMin = Math.min(...xValues); const xMax = Math.max(...xValues); const yMin = Math.min(0, ...yValues); const yMax = Math.max(0, ...yValues); const xRange = xMax - xMin || 1; const yRange = yMax - yMin || 1; const xScale = value => margin.left + ((value - xMin) / xRange) * innerWidth; const yScale = value => margin.top + innerHeight - ((value - yMin) / yRange) * innerHeight; const baseY = yScale(0); let series = ""; if (chartType === "bar") { const barWidth = innerWidth / Math.max(points.length, 1); series = points.map((point, index) => { const x = margin.left + index * barWidth + barWidth * 0.15; const y = Math.min(yScale(point.yValue), baseY); const h = Math.abs(baseY - yScale(point.yValue)); return `<g><rect x="${x}" y="${y}" width="${Math.max(2, barWidth * 0.7)}" height="${Math.max(h, 1)}" rx="4" fill="var(--accent)" opacity="0.88"></rect><title>${escapeHtml(point.label)}: ${escapeHtml(formatNumber(point.yValue))}</title></g>`; }).join(""); } else { const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.xValue)} ${yScale(point.yValue)}`).join(" "); const line = chartType === "line" ? `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"></path>` : ""; const dots = points.map(point => `<g><circle cx="${xScale(point.xValue)}" cy="${yScale(point.yValue)}" r="${chartType === "scatter" ? 4 : 3}" fill="var(--accent)" stroke="white" stroke-width="1.2"></circle><title>${escapeHtml(point.label)}: ${escapeHtml(formatNumber(point.yValue))}</title></g>`).join(""); series = `${line}${dots}`; } const grid = Array.from({ length: 5 }, (_, tickIndex) => { const tickValue = yMin + (yRange * tickIndex) / 4; const y = yScale(tickValue); return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="rgba(127,127,127,0.18)" stroke-width="1"></line><text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="currentColor" opacity="0.75" font-size="11">${escapeHtml(formatNumber(tickValue))}</text>`; }).join(""); const tickIds = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((value, index, array) => array.indexOf(value) === index); const xTicks = tickIds.map(index => { const point = points[index]; const x = chartType === "bar" ? margin.left + ((index + 0.5) / points.length) * innerWidth : xScale(point.xValue); return `<text x="${x}" y="${height - 20}" text-anchor="middle" fill="currentColor" opacity="0.75" font-size="11">${escapeHtml(point.label)}</text>`; }).join(""); return `${grid}<line x1="${margin.left}" y1="${baseY}" x2="${width - margin.right}" y2="${baseY}" stroke="currentColor" opacity="0.35" stroke-width="1.4"></line><line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="currentColor" opacity="0.35" stroke-width="1.4"></line>${series}<text x="${width / 2}" y="${height - 6}" text-anchor="middle" fill="currentColor" opacity="0.75" font-size="12">${escapeHtml(xLabel)}</text><text x="18" y="${height / 2}" text-anchor="middle" transform="rotate(-90 18 ${height / 2})" fill="currentColor" opacity="0.75" font-size="12">${escapeHtml(yLabel)}</text>${xTicks}`; }',
            'function toNumber(value) { const cleaned = String(value ?? "").trim().replace(/,/g, ""); if (!cleaned) return null; const numberValue = Number(cleaned); return Number.isFinite(numberValue) ? numberValue : null; }',
            'function formatNumber(value) { const numberValue = Number(value); return Number.isFinite(numberValue) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(numberValue) : String(value); }',
            'function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\'/g, "&#39;"); }'
        ].join('\n');
    }

    private getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin:0; padding:24px; background:#101722; color:#edf2f7; font-family:Georgia,"Palatino Linotype",serif; }
        .card { max-width:860px; margin:0 auto; padding:28px; border-radius:18px; background:rgba(22,31,43,.94); border:1px solid rgba(255,255,255,.08); }
        p,code { color:#cbd5e1; } code { word-break:break-all; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Could not build the output explorer</h1>
        <p>${escapeHtml(message)}</p>
        <code>${escapeHtml(this.filePath)}</code>
    </div>
</body>
</html>`;
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function serializeForScript(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
