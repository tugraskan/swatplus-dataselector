/**
 * Native TypeScript indexer for SWAT+ TxtInOut datasets.
 *
 * This module replaces the Python/pandas-based indexer (scripts/pandas_indexer.py)
 * so the extension works out of the box without requiring a Python installation.
 *
 * The logic mirrors pandas_indexer.py exactly:
 *  - Standard whitespace-delimited file parsing with schema-driven column mapping
 *  - Hierarchical file support (soils.sol, plant.ini, management.sch, weather-wgn.cli, atmo.cli)
 *  - Decision-table file support (*.dtl)
 *  - Weather data file support (*.pcp, *.tmp, *.slr, *.hmd, *.wnd)
 *  - FK reference extraction
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants (mirrors pandas_indexer.py)
// ---------------------------------------------------------------------------

const MAX_CHILD_LINES = 1000;
const MANAGEMENT_SCH_OP_DATA1_INDEX = 6;
const DTL_ACTION_FP_INDEX = 7;
const WEATHER_FILE_POINTER_FK_TABLES = new Set([
    'pcp_cli', 'tmp_cli', 'slr_cli', 'hmd_cli', 'wnd_cli'
]);
const WEATHER_DATA_SCHEMA_FILES: { [ext: string]: string } = {
    '.pcp': 'weather-pcp.pcp',
    '.tmp': 'weather-tmp.tmp',
    '.slr': 'weather-slr.slr',
    '.hmd': 'weather-hmd.hmd',
    '.wnd': 'weather-wnd.wnd',
};

// ---------------------------------------------------------------------------
// Public payload types
// ---------------------------------------------------------------------------

export interface NativeIndexPayload {
    tables: { [tableName: string]: NativeRow[] };
    fkReferences: NativeFKRef[];
    fileTableMap: { [fileName: string]: string };
    stats: { tableCount: number; fkCount: number };
}

export interface NativeRow {
    file: string;
    tableName: string;
    lineNumber: number;
    pkValue: string;
    pkValueLower: string;
    values: { [key: string]: string };
    childRows?: Array<{ lineNumber: number; values: { [key: string]: string } }>;
}

export interface NativeFKRef {
    sourceFile: string;
    sourceTable: string;
    sourceLine: number;
    sourceColumn: string;
    fkValue: string;
    fkValueLower: string;
    targetTable: string;
    targetColumn: string;
    resolved: boolean;
}

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

interface ParsedRecord {
    lineNumber: number;
    pkValue: string;
    pkValueLower: string;
    values: { [key: string]: string };
}

// ---------------------------------------------------------------------------
// File discovery helpers
// ---------------------------------------------------------------------------

/** Collect the set of lowercase filenames referenced in file.cio. */
function loadFileCioFilenames(datasetPath: string): Set<string> {
    const fileCioPath = path.join(datasetPath, 'file.cio');
    if (!fs.existsSync(fileCioPath)) {
        return new Set();
    }
    try {
        const lines = fs.readFileSync(fileCioPath, 'utf-8').split('\n');
        const filenames = new Set<string>();
        for (let i = 1; i < lines.length; i++) {
            const stripped = lines[i].trim();
            if (!stripped || stripped.startsWith('#')) {
                continue;
            }
            const parts = stripped.split(/\s+/);
            if (parts.length < 2) {
                continue;
            }
            for (let j = 1; j < parts.length; j++) {
                const candidate = parts[j].trim().toLowerCase();
                if (!candidate || candidate === 'null' || candidate === '0') {
                    continue;
                }
                filenames.add(candidate);
            }
        }
        return filenames;
    } catch {
        return new Set();
    }
}

/**
 * Try to find an actual file in the dataset that corresponds to the given
 * schema file name by matching against the filenames listed in file.cio.
 *
 * Mirrors the Python `find_file_cio_override` function.
 */
function findFileCioOverride(
    datasetPath: string,
    schemaFile: string,
    fileCioFiles: Set<string>
): string | null {
    if (fileCioFiles.size === 0) {
        return null;
    }
    const dotIdx = schemaFile.lastIndexOf('.');
    const base = dotIdx >= 0 ? schemaFile.slice(0, dotIdx).toLowerCase() : schemaFile.toLowerCase();
    const suffix = dotIdx >= 0 ? schemaFile.slice(dotIdx).toLowerCase() : '';

    const candidates = Array.from(fileCioFiles).filter(name => {
        const nameDot = name.indexOf('.');
        const nameBase = nameDot >= 0 ? name.slice(0, nameDot) : name;
        return name.endsWith(suffix) && nameBase.startsWith(base);
    });

    if (candidates.length !== 1) {
        return null;
    }
    const candidatePath = path.join(datasetPath, candidates[0]);
    return fs.existsSync(candidatePath) ? candidatePath : null;
}

// ---------------------------------------------------------------------------
// Hierarchical file helpers
// ---------------------------------------------------------------------------

function isHierarchicalFile(fileName: string, metadata: any): boolean {
    const hierarchicalFiles = metadata?.hierarchical_files ?? {};
    return fileName in hierarchicalFiles && fileName !== 'description';
}

function getChildLineCount(
    valueMap: { [key: string]: string },
    config: any,
    fileName: string
): number {
    const structure = config?.structure ?? {};

    const fixedCount = structure.child_line_count_fixed;
    if (fixedCount !== undefined && fixedCount !== null && fixedCount > 0) {
        return Math.min(fixedCount, MAX_CHILD_LINES);
    }

    let countField: string = structure.child_line_count_field;
    if (!countField) {
        return 0;
    }

    // plant.ini alternate field name
    if (fileName === 'plant.ini' && !(countField in valueMap) && 'plt_cnt' in valueMap) {
        countField = 'plt_cnt';
    }

    // Combined fields like "numb_auto+numb_ops"
    if (countField.includes('+')) {
        const fields = countField.split('+').map((f: string) => f.trim());
        let total = 0;
        for (const field of fields) {
            if (field in valueMap) {
                const n = parseInt(valueMap[field], 10);
                if (!isNaN(n) && n > 0) {
                    total += n;
                }
            }
        }
        return total < 0 ? 0 : Math.min(total, MAX_CHILD_LINES);
    }

    if (countField in valueMap) {
        const n = parseInt(valueMap[countField], 10);
        if (isNaN(n) || n < 0) {
            return 0;
        }
        const multiplier: number = structure.child_line_count_multiplier ?? 1;
        return Math.min(n * multiplier, MAX_CHILD_LINES);
    }

    return 0;
}

function isMainRecordLine(
    _valueMap: { [key: string]: string },
    fileName: string,
    tokens: string[]
): boolean {
    if (fileName === 'soils.sol') {
        if (tokens.length < 3) { return false; }
        if (isNaN(parseInt(tokens[1], 10))) { return false; }
        return /^[a-zA-Z]+$/.test(tokens[2]);
    }
    if (fileName === 'plant.ini') {
        if (tokens.length < 2) { return false; }
        return !isNaN(parseInt(tokens[1], 10));
    }
    // .dtl and default: treat as main record
    return true;
}

// ---------------------------------------------------------------------------
// Core file parser
// ---------------------------------------------------------------------------

function parseLinesWithSchema(
    filePath: string,
    table: any,
    metadata: any,
    lines: string[]
): { records: ParsedRecord[]; childLineInfo: Array<[number, number]>; columns: string[] } {
    const fileName = path.basename(filePath);
    const startLine: number = table.data_starts_after ?? 0;
    const fileMetadata = metadata?.file_metadata?.[fileName] ?? {};
    const includeAutoFields: boolean = (fileMetadata.primary_keys ?? []).includes('id');

    const schemaColumnsAll: string[] = (table.columns ?? []).map((c: any) => c.name as string);
    const schemaColumns: string[] = (table.columns ?? [])
        .filter((c: any) => includeAutoFields || c.type !== 'AutoField')
        .map((c: any) => c.name as string);

    let columns = schemaColumns;

    if (table.has_header_line && lines.length > 0) {
        const headerIndex = Math.max(startLine - 1, 0);
        if (headerIndex < lines.length) {
            const headerLine = lines[headerIndex].trim();
            if (headerLine) {
                const headerColumns = headerLine.split(/\s+/);
                if (headerColumns.length > 0) {
                    if (fileName === 'plant.ini') {
                        const plantHeaderMap: { [k: string]: string } = {
                            pcom_name: 'name',
                            plt_cnt: 'plnt_cnt',
                            plt_name: 'plnt_name',
                        };
                        columns = headerColumns.map(c => plantHeaderMap[c.toLowerCase()] ?? c.toLowerCase());
                    } else {
                        const headerLower = headerColumns.map(c => c.toLowerCase());
                        if (headerColumns.every(c => schemaColumnsAll.includes(c))) {
                            columns = headerColumns;
                        } else if (headerLower.every(c => schemaColumnsAll.includes(c))) {
                            columns = headerLower;
                        } else if (headerLower.some(c => schemaColumnsAll.includes(c))) {
                            columns = headerLower;
                        }
                    }
                }
            }
        }
    }

    const isHierarchical = isHierarchicalFile(fileName, metadata);
    const hierarchicalConfig = isHierarchical ? metadata?.hierarchical_files?.[fileName] : null;

    const pkCandidates: string[] = table.primary_keys ?? [];
    const pkColumn: string | null = pkCandidates[0] ?? null;

    const records: ParsedRecord[] = [];
    const childLineInfo: Array<[number, number]> = [];

    let i = startLine;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line) {
            i++;
            continue;
        }

        const tokens = line.split(/\s+/);
        const valueMap: { [key: string]: string } = {};
        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
            valueMap[columns[colIdx]] = colIdx < tokens.length ? tokens[colIdx] : '';
        }

        let skipCount = 0;
        if (isHierarchical && hierarchicalConfig) {
            const explicitCount = getChildLineCount(valueMap, hierarchicalConfig, fileName);
            if (explicitCount > 0) {
                skipCount = explicitCount;
                childLineInfo.push([i + 1, skipCount]); // 1-based line number
            } else {
                const isMain = isMainRecordLine(valueMap, fileName, tokens);
                if (fileName === 'plant.ini' && isMain && tokens.length > 1) {
                    const count = parseInt(tokens[1], 10);
                    if (!isNaN(count) && count > 0) {
                        skipCount = count;
                        childLineInfo.push([i + 1, skipCount]);
                    }
                }
                if (!isMain) {
                    i++;
                    continue;
                }
            }
        }

        // Determine primary key value
        let pkValue: string;
        if (pkColumn && pkColumn in valueMap && valueMap[pkColumn] !== '') {
            pkValue = valueMap[pkColumn];
        } else if ('name' in valueMap && valueMap['name'] !== '') {
            pkValue = valueMap['name'];
        } else if ('filename' in valueMap && valueMap['filename'] !== '') {
            pkValue = valueMap['filename'];
        } else {
            pkValue = String(records.length);
        }

        records.push({
            lineNumber: i + 1, // 1-based
            pkValue,
            pkValueLower: pkValue.toLowerCase(),
            values: valueMap,
        });

        if (skipCount > 0) {
            i += skipCount;
        }
        i++;
    }

    return { records, childLineInfo, columns };
}

// ---------------------------------------------------------------------------
// Weather data file handler
// ---------------------------------------------------------------------------

function buildWeatherDataRows(
    filePath: string,
    table: any
): [NativeRow[], { [name: string]: string }] {
    let lines: string[];
    try {
        lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
        return [[], {}];
    }

    if (lines.length === 0) {
        return [[], {}];
    }

    const commentLine = lines[0].trim();
    let headerIdx: number | null = null;
    let stationIdx: number | null = null;

    for (let idx = 1; idx < lines.length; idx++) {
        if (headerIdx === null && lines[idx].trim()) {
            headerIdx = idx;
            continue;
        }
        if (headerIdx !== null && lines[idx].trim()) {
            stationIdx = idx;
            break;
        }
    }

    if (stationIdx === null) {
        return [[], {}];
    }

    const stationValues = lines[stationIdx].trim().split(/\s+/);
    const schemaColumns: string[] = (table.columns ?? [])
        .filter((c: any) => c.type !== 'AutoField')
        .map((c: any) => c.name as string);

    const values: { [key: string]: string } = {};
    for (const col of schemaColumns) {
        values[col] = '';
    }

    const nameValue = commentLine || path.basename(filePath);
    if ('name' in values) {
        values['name'] = nameValue;
    }

    const stationFieldOrder = ['nbyr', 'tstep', 'lat', 'lon', 'elev'].filter(c => c in values);
    for (let idx = 0; idx < stationFieldOrder.length; idx++) {
        if (idx < stationValues.length) {
            values[stationFieldOrder[idx]] = stationValues[idx];
        }
    }

    const pkValue = values['name'] || path.basename(filePath);

    // Build child rows from data lines
    const dataColumns = ['year', 'month', 'value'].filter(c => schemaColumns.includes(c));
    const childRows: Array<{ lineNumber: number; values: { [key: string]: string } }> = [];

    for (let dataLineIdx = stationIdx + 1; dataLineIdx < lines.length; dataLineIdx++) {
        const line = lines[dataLineIdx].trim();
        if (!line) { continue; }
        const dataValues = line.split(/\s+/);
        const dataValueMap: { [key: string]: string } = {};
        for (let ci = 0; ci < dataValues.length; ci++) {
            if (ci < dataColumns.length) {
                dataValueMap[dataColumns[ci]] = dataValues[ci];
            } else {
                dataValueMap[`col${ci + 1}`] = dataValues[ci];
            }
        }
        childRows.push({ lineNumber: dataLineIdx + 1, values: dataValueMap });
    }

    const row: NativeRow = {
        file: filePath,
        tableName: table.table_name,
        lineNumber: stationIdx + 1,
        pkValue,
        pkValueLower: pkValue.toLowerCase(),
        values,
        childRows: childRows.length > 0 ? childRows : undefined,
    };

    return [[row], { [path.basename(filePath).toLowerCase()]: table.table_name }];
}

// ---------------------------------------------------------------------------
// FK reference builder
// ---------------------------------------------------------------------------

function buildFkReferences(
    records: ParsedRecord[],
    columns: string[],
    table: any,
    filePath: string,
    fkNullValues: string[],
    metadata: any
): NativeFKRef[] {
    const references: NativeFKRef[] = [];
    const nullSet = new Set(fkNullValues.map(v => v.toLowerCase()));
    const txtinoutTargetColumn: string =
        metadata?.txtinout_fk_behavior?.default_target_column ?? 'name';

    const fileName = path.basename(filePath);
    const filePointerConfig: any = metadata?.file_pointer_columns?.[fileName] ?? {};
    const filePointerColumns = new Set(
        Object.keys(filePointerConfig).filter(k => k !== 'description')
    );

    for (const fk of (table.foreign_keys ?? []) as any[]) {
        const column: string = fk.column;
        if (!column || !columns.includes(column)) {
            continue;
        }

        const targetTable: string = fk.references?.table ?? '';
        // Skip file-pointer columns unless they point to weather-file FK tables
        if (filePointerColumns.has(column) && !WEATHER_FILE_POINTER_FK_TABLES.has(targetTable)) {
            continue;
        }

        for (const record of records) {
            const fkValue = record.values[column];
            if (fkValue === undefined) { continue; }
            const fkValueLower = fkValue.toLowerCase();
            if (nullSet.has(fkValueLower)) { continue; }

            references.push({
                sourceFile: filePath,
                sourceTable: table.table_name,
                sourceLine: record.lineNumber,
                sourceColumn: column,
                fkValue,
                fkValueLower,
                targetTable,
                targetColumn: txtinoutTargetColumn,
                resolved: false,
            });
        }
    }

    return references;
}

// ---------------------------------------------------------------------------
// management.sch child-line FK extractor
// ---------------------------------------------------------------------------

function processManagementSchChildLines(
    filePath: string,
    table: any,
    lines: string[],
    startLine: number,
    numbAuto: number,
    numbOps: number,
    fkNullValues: string[]
): NativeFKRef[] {
    const references: NativeFKRef[] = [];
    const nullSet = new Set(fkNullValues.map(v => v.toLowerCase()));

    const opTypeToTable: { [op: string]: string } = {
        plnt: 'plant_ini',
        harv: 'harv_ops',
        hvkl: 'plant_ini',
        kill: 'plant_ini',
        till: 'tillage_til',
        irrm: 'irr_ops',
        irra: 'irr_ops',
        fert: 'fertilizer_frt',
        frta: 'fertilizer_frt',
        frtc: 'fertilizer_frt',
        pest: 'pesticide_pes',
        pstc: 'pesticide_pes',
        graz: 'graze_ops',
    };

    let currentLine = startLine;

    for (let j = 0; j < numbAuto; j++) {
        if (currentLine >= lines.length) { break; }
        const line = lines[currentLine].trim();
        if (line) {
            const tokens = line.split(/\s+/);
            const dtlName = tokens[0];
            if (dtlName && !nullSet.has(dtlName.toLowerCase())) {
                references.push({
                    sourceFile: filePath,
                    sourceTable: table.table_name,
                    sourceLine: currentLine + 1,
                    sourceColumn: 'auto_op_dtl',
                    fkValue: dtlName,
                    fkValueLower: dtlName.toLowerCase(),
                    targetTable: 'lum_dtl',
                    targetColumn: 'name',
                    resolved: false,
                });
            }
        }
        currentLine++;
    }

    for (let j = 0; j < numbOps; j++) {
        if (currentLine >= lines.length) { break; }
        const line = lines[currentLine].trim();
        if (line) {
            const values = line.split(/\s+/);
            if (values.length > 0) {
                const opType = values[0];
                const opData1 =
                    values.length > MANAGEMENT_SCH_OP_DATA1_INDEX
                        ? values[MANAGEMENT_SCH_OP_DATA1_INDEX]
                        : null;
                if (
                    opType &&
                    opData1 &&
                    opType in opTypeToTable &&
                    !nullSet.has(opData1.toLowerCase())
                ) {
                    references.push({
                        sourceFile: filePath,
                        sourceTable: table.table_name,
                        sourceLine: currentLine + 1,
                        sourceColumn: `op_data1(${opType})`,
                        fkValue: opData1,
                        fkValueLower: opData1.toLowerCase(),
                        targetTable: opTypeToTable[opType],
                        targetColumn: 'name',
                        resolved: false,
                    });
                }
            }
        }
        currentLine++;
    }

    return references;
}

// ---------------------------------------------------------------------------
// Decision table file parser
// ---------------------------------------------------------------------------

function processDtlFile(
    filePath: string,
    table: any,
    fkNullValues: string[]
): [NativeRow[], NativeFKRef[]] {
    const nullSet = new Set(fkNullValues.map(v => v.toLowerCase()));
    const rowPayload: NativeRow[] = [];
    const fkReferences: NativeFKRef[] = [];

    const actionTypeToTable: { [act: string]: string } = {
        harvest: 'harv_ops',
        harvest_kill: 'harv_ops',
        pest_apply: 'chem_app_ops',
        fertilize: 'chem_app_ops',
    };

    let lines: string[];
    try {
        lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
        return [[], []];
    }

    if (lines.length < 2) { return [[], []]; }

    const numTables = parseInt(lines[1].trim(), 10);
    if (isNaN(numTables) || numTables < 0) { return [[], []]; }

    let currentLine = 2;

    // Skip blank lines after count line
    while (currentLine < lines.length && !lines[currentLine].trim()) {
        currentLine++;
    }

    // Skip global header line (NAME / DTBL_NAME  CONDS  ALTS  ACTS)
    if (currentLine < lines.length) {
        const ph = lines[currentLine].trim().toUpperCase();
        if (ph.startsWith('NAME') || ph.startsWith('DTBL_NAME')) {
            currentLine++;
        }
    }

    let processedTables = 0;
    while (processedTables < numTables && currentLine < lines.length) {
        // Skip blank lines before this decision table
        while (currentLine < lines.length && !lines[currentLine].trim()) {
            currentLine++;
        }
        if (currentLine >= lines.length) { break; }

        const headerLine = lines[currentLine].trim();
        if (!headerLine) { break; }

        const headerUpper = headerLine.toUpperCase();
        if (headerUpper.startsWith('NAME') || headerUpper.startsWith('DTBL_NAME')) {
            currentLine++;
            continue;
        }

        const headerValues = headerLine.split(/\s+/);
        if (headerValues.length < 4) { currentLine++; continue; }

        const dtblName = headerValues[0];
        const conds = parseInt(headerValues[1], 10);
        const alts = parseInt(headerValues[2], 10);
        const acts = parseInt(headerValues[3], 10);
        if (isNaN(conds) || isNaN(alts) || isNaN(acts)) { currentLine++; continue; }

        const childRows: Array<{ lineNumber: number; values: { [key: string]: string } }> = [];

        rowPayload.push({
            file: filePath,
            tableName: table.table_name,
            lineNumber: currentLine + 1,
            pkValue: dtblName,
            pkValueLower: dtblName.toLowerCase(),
            values: { name: dtblName, conds: String(conds), alts: String(alts), acts: String(acts) },
            childRows,
        });

        currentLine++;
        processedTables++;

        // Skip conditions section header
        while (currentLine < lines.length && !lines[currentLine].trim()) { currentLine++; }
        if (currentLine < lines.length) {
            if (lines[currentLine].trim().toUpperCase().startsWith('COND_VAR')) {
                currentLine++;
            }
        }

        // Parse conditions
        const condCols = ['cond_var', 'obj', 'obj_num', 'lim_var', 'lim_op', 'lim_const'];
        for (let ai = 0; ai < alts; ai++) { condCols.push(`alt${ai + 1}`); }

        for (let ci = 0; ci < conds; ci++) {
            while (currentLine < lines.length && !lines[currentLine].trim()) { currentLine++; }
            if (currentLine >= lines.length) { break; }
            const condTokens = lines[currentLine].trim().split(/\s+/);
            const condMap: { [key: string]: string } = { section: 'condition' };
            for (let k = 0; k < condCols.length; k++) {
                condMap[condCols[k]] = k < condTokens.length ? condTokens[k] : '';
            }
            childRows.push({ lineNumber: currentLine + 1, values: condMap });
            currentLine++;
        }

        // Skip actions section header
        while (currentLine < lines.length && !lines[currentLine].trim()) { currentLine++; }
        if (currentLine < lines.length) {
            if (lines[currentLine].trim().toUpperCase().startsWith('ACT_TYP')) {
                currentLine++;
            }
        }

        // Parse actions
        const actCols = [
            'act_typ', 'obj', 'obj_num', 'act_name', 'act_option', 'const', 'const2', 'fp',
        ];
        for (let ai = 0; ai < alts; ai++) { actCols.push(`out${ai + 1}`); }

        for (let ai = 0; ai < acts; ai++) {
            if (currentLine >= lines.length) { break; }
            const actionLine = lines[currentLine].trim();
            if (actionLine) {
                const actionTokens = actionLine.split(/\s+/);
                const actionMap: { [key: string]: string } = { section: 'action' };
                for (let k = 0; k < actCols.length; k++) {
                    actionMap[actCols[k]] = k < actionTokens.length ? actionTokens[k] : '';
                }
                childRows.push({ lineNumber: currentLine + 1, values: actionMap });

                if (actionTokens.length > DTL_ACTION_FP_INDEX) {
                    const actTyp = actionTokens[0];
                    const fp = actionTokens[DTL_ACTION_FP_INDEX];
                    if (actTyp in actionTypeToTable && !nullSet.has(fp.toLowerCase())) {
                        fkReferences.push({
                            sourceFile: filePath,
                            sourceTable: table.table_name,
                            sourceLine: currentLine + 1,
                            sourceColumn: `fp(${actTyp})`,
                            fkValue: fp,
                            fkValueLower: fp.toLowerCase(),
                            targetTable: actionTypeToTable[actTyp],
                            targetColumn: 'name',
                            resolved: false,
                        });
                    }
                }
            }
            currentLine++;
        }
    }

    return [rowPayload, fkReferences];
}

// ---------------------------------------------------------------------------
// Hierarchical file detail extractors
// ---------------------------------------------------------------------------

function extractSoilsDetails(
    record: ParsedRecord,
    lines: string[]
): [{ [key: string]: string }, Array<{ lineNumber: number; values: { [key: string]: string } }>] {
    const valueUpdates: { [key: string]: string } = {};
    const childRows: Array<{ lineNumber: number; values: { [key: string]: string } }> = [];
    const lineIdx = record.lineNumber - 1;

    if (lineIdx < 0 || lineIdx >= lines.length) {
        return [valueUpdates, childRows];
    }

    const mainTokens = lines[lineIdx].trim().split(/\s+/);
    let layerCount = 0;

    if (mainTokens.length > 0) {
        valueUpdates.name = mainTokens[0];
        layerCount = mainTokens.length > 1 ? (parseInt(mainTokens[1], 10) || 0) : 0;
        valueUpdates.nly = layerCount > 0 ? String(layerCount) : '';
        valueUpdates.hyd_grp = mainTokens[2] ?? '';
        valueUpdates.dp_tot = mainTokens[3] ?? '';
        valueUpdates.anion_excl = mainTokens[4] ?? '';
        valueUpdates.perc_crk = mainTokens[5] ?? '';
        valueUpdates.texture = mainTokens[6] ?? '';
        valueUpdates.description = mainTokens.length > 7 ? mainTokens.slice(7).join(' ') : '';
    }

    if (layerCount > 0) {
        const layerCols = [
            'dp', 'bd', 'awc', 'soil_k', 'carbon', 'clay', 'silt', 'sand',
            'rock', 'alb', 'usle_k', 'ec', 'caco3', 'ph',
        ];
        for (let li = 0; li < layerCount; li++) {
            const ci = lineIdx + 1 + li;
            if (ci >= lines.length) { break; }
            const childLine = lines[ci].trim();
            if (!childLine) { continue; }
            const t = childLine.split(/\s+/);
            const cv: { [key: string]: string } = { layer: String(li + 1) };
            for (let k = 0; k < layerCols.length; k++) {
                cv[layerCols[k]] = k < t.length ? t[k] : '';
            }
            childRows.push({ lineNumber: ci + 1, values: cv });
        }
    }

    return [valueUpdates, childRows];
}

function extractPlantDetails(
    lines: string[],
    childLineInfo: Array<[number, number]>,
    recordIndex: number
): [{ [key: string]: string }, Array<{ lineNumber: number; values: { [key: string]: string } }>] {
    const valueUpdates: { [key: string]: string } = {};
    const childRows: Array<{ lineNumber: number; values: { [key: string]: string } }> = [];

    if (!childLineInfo || recordIndex >= childLineInfo.length) {
        return [valueUpdates, childRows];
    }

    const [lineNum, childCount] = childLineInfo[recordIndex];
    if (childCount <= 0) { return [valueUpdates, childRows]; }

    const lineIdx = lineNum - 1;
    if (lineIdx >= 0 && lineIdx < lines.length) {
        const t = lines[lineIdx].trim().split(/\s+/);
        if (t.length >= 3) {
            valueUpdates.name = t[0];
            valueUpdates.plnt_cnt = t[1];
            valueUpdates.rot_yr_ini = t[2];
        }
    }

    const plantCols = [
        'plnt_name', 'lc_status', 'lai_init', 'bm_init',
        'phu_init', 'plnt_pop', 'yrs_init', 'rsd_init',
    ];
    for (let pi = 0; pi < childCount; pi++) {
        const ci = lineIdx + 1 + pi;
        if (ci >= lines.length) { break; }
        const childLine = lines[ci].trim();
        if (!childLine) { continue; }
        const t = childLine.split(/\s+/);
        const cv: { [key: string]: string } = {};
        for (let k = 0; k < plantCols.length; k++) {
            cv[plantCols[k]] = k < t.length ? t[k] : '';
        }
        childRows.push({ lineNumber: ci + 1, values: cv });
    }

    return [valueUpdates, childRows];
}

function getManagementSchCounts(
    lines: string[],
    record: ParsedRecord
): [number, number, { [key: string]: string }] {
    const valueUpdates: { [key: string]: string } = {};
    const lineIdx = record.lineNumber - 1;
    let mainTokens: string[] = [];
    if (lineIdx >= 0 && lineIdx < lines.length) {
        mainTokens = lines[lineIdx].trim().split(/\s+/);
    }

    if (mainTokens.length >= 3) {
        if (!record.values['numb_ops']) { valueUpdates['numb_ops'] = mainTokens[1]; }
        if (!record.values['numb_auto']) { valueUpdates['numb_auto'] = mainTokens[2]; }
    }

    const safeInt = (v: string | undefined): number => {
        if (!v) { return 0; }
        const n = parseInt(v, 10);
        return isNaN(n) ? 0 : n;
    };

    const numbOps = safeInt(valueUpdates['numb_ops'] ?? record.values['numb_ops']);
    const numbAuto = safeInt(valueUpdates['numb_auto'] ?? record.values['numb_auto']);
    return [numbAuto, numbOps, valueUpdates];
}

function extractManagementSchDetails(
    lines: string[],
    record: ParsedRecord
): [{ [key: string]: string }, Array<{ lineNumber: number; values: { [key: string]: string } }>] {
    const valueUpdates: { [key: string]: string } = {};
    const childRows: Array<{ lineNumber: number; values: { [key: string]: string } }> = [];

    if (record.lineNumber <= 0) { return [valueUpdates, childRows]; }

    const [numbAuto, numbOps, updates] = getManagementSchCounts(lines, record);
    Object.assign(valueUpdates, updates);

    // startIdx: record.lineNumber is 1-based, so the next physical line is index record.lineNumber
    const startIdx = record.lineNumber;

    for (let ai = 0; ai < numbAuto; ai++) {
        const ci = startIdx + ai;
        if (ci >= lines.length) { break; }
        const line = lines[ci].trim();
        if (!line) { continue; }
        const t = line.split(/\s+/);
        if (t.length === 0) { continue; }
        childRows.push({
            lineNumber: ci + 1,
            values: {
                section: 'auto',
                name: t[0],
                d_table: t[0],
                plant1: t[1] ?? '',
                plant2: t[2] ?? '',
            },
        });
    }

    const opStartIdx = startIdx + numbAuto;
    for (let oi = 0; oi < numbOps; oi++) {
        const ci = opStartIdx + oi;
        if (ci >= lines.length) { break; }
        const line = lines[ci].trim();
        if (!line) { continue; }
        const t = line.split(/\s+/);
        if (t.length === 0) { continue; }
        childRows.push({
            lineNumber: ci + 1,
            values: {
                section: 'op',
                op_typ: t[0],
                mon: t[1] ?? '',
                day: t[2] ?? '',
                hu_sch: t[3] ?? '',
                op_data1: t[4] ?? '',
                op_data2: t[5] ?? '',
                op_data3: t[6] ?? '',
            },
        });
    }

    return [valueUpdates, childRows];
}

function extractWeatherWgnDetails(
    lines: string[],
    childLineInfo: Array<[number, number]>,
    recordIndex: number
): Array<{ lineNumber: number; values: { [key: string]: string } }> {
    const childRows: Array<{ lineNumber: number; values: { [key: string]: string } }> = [];

    if (!childLineInfo || recordIndex >= childLineInfo.length) { return childRows; }

    const [lineNum, childCount] = childLineInfo[recordIndex];
    if (childCount <= 0) { return childRows; }

    const monthlyCols = [
        'tmp_max_ave', 'tmp_min_ave', 'tmp_max_sd', 'tmp_min_sd',
        'pcp_ave', 'pcp_sd', 'pcp_skew', 'wet_dry', 'wet_wet',
        'pcp_days', 'pcp_hhr', 'slr_ave', 'dew_ave', 'wnd_ave',
    ];

    const startIdx = lineNum - 1;
    for (let mi = 0; mi < 12; mi++) {
        const ci = startIdx + mi + 2;
        if (ci >= lines.length) { continue; }
        const line = lines[ci].trim();
        if (!line) { continue; }
        const t = line.split(/\s+/);
        const cv: { [key: string]: string } = { month: String(mi + 1) };
        for (let k = 0; k < monthlyCols.length; k++) {
            cv[monthlyCols[k]] = k < t.length ? t[k] : '';
        }
        childRows.push({ lineNumber: ci + 1, values: cv });
    }

    return childRows;
}

function extractAtmoDetails(
    record: ParsedRecord,
    lines: string[]
): Array<{ lineNumber: number; values: { [key: string]: string } }> {
    const childRows: Array<{ lineNumber: number; values: { [key: string]: string } }> = [];

    const numSta = parseInt(record.values['num_sta'] ?? '0', 10);
    const numAa = parseInt(record.values['num_aa'] ?? '0', 10);
    if (isNaN(numSta) || isNaN(numAa) || numSta <= 0 || numAa <= 0) {
        return childRows;
    }

    const currentLineIdx = record.lineNumber - 1;
    const depositionTypes = ['nh4_wet', 'no3_wet', 'nh4_dry', 'no3_dry'];

    for (let si = 0; si < numSta; si++) {
        const stationLineIdx = currentLineIdx + 1 + si * 5;
        if (stationLineIdx >= lines.length) { continue; }
        const stationName = lines[stationLineIdx].trim();
        const stationData: { [key: string]: any } = { station_name: stationName };
        for (let di = 0; di < depositionTypes.length; di++) {
            const depType = depositionTypes[di];
            const dataLineIdx = stationLineIdx + 1 + di;
            if (dataLineIdx < lines.length) {
                const dLine = lines[dataLineIdx].trim();
                const vals = dLine.split(/\s+/);
                if (vals.length > 0) {
                    stationData[depType] = vals.length > 1 ? vals.slice(0, -1) : vals;
                    stationData[`${depType}_line`] = dataLineIdx + 1;
                }
            }
        }
        childRows.push({ lineNumber: stationLineIdx + 1, values: stationData });
    }

    return childRows;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Build an index for the given SWAT+ TxtInOut dataset using pure TypeScript.
 * Returns the same payload structure as the Python pandas_indexer.py script.
 */
export function buildIndexNative(
    datasetPath: string,
    schema: any,
    metadata: any
): NativeIndexPayload {
    const fkNullValues: string[] =
        metadata?.null_sentinel_values?.global ?? ['null', '0', ''];

    const tablesPayload: { [tableName: string]: NativeRow[] } = {};
    const fkReferences: NativeFKRef[] = [];
    const processedFiles = new Set<string>();
    const fileTableMap: { [name: string]: string } = {};

    const tableNameToFile: { [tableName: string]: string } =
        metadata?.table_name_to_file_name ?? {};
    const fileCioFiles = loadFileCioFilenames(datasetPath);

    // ---- Process each table defined in the schema ----
    for (const [schemaFileName, table] of Object.entries(schema?.tables ?? {}) as [string, any][]) {
        let filePath = path.join(datasetPath, schemaFileName);

        if (!fs.existsSync(filePath)) {
            // Metadata mapping fallback
            const mappedName = tableNameToFile[table.table_name];
            if (mappedName) {
                const mappedPath = path.join(datasetPath, mappedName);
                if (fs.existsSync(mappedPath)) { filePath = mappedPath; }
            }
        }

        if (!fs.existsSync(filePath)) {
            // Alternate names: swap - and _
            const altNames = new Set<string>();
            if (schemaFileName.includes('-')) { altNames.add(schemaFileName.replace(/-/g, '_')); }
            if (schemaFileName.includes('_')) { altNames.add(schemaFileName.replace(/_/g, '-')); }

            let found = false;
            for (const alt of altNames) {
                const altPath = path.join(datasetPath, alt);
                if (fs.existsSync(altPath)) { filePath = altPath; found = true; break; }
            }

            if (!found) {
                const override = findFileCioOverride(datasetPath, schemaFileName, fileCioFiles);
                if (override !== null) {
                    filePath = override;
                } else {
                    continue; // file not found – skip
                }
            }
        }

        const actualFileName = path.basename(filePath);
        const actualFileNameLower = actualFileName.toLowerCase();
        processedFiles.add(actualFileNameLower);
        fileTableMap[actualFileNameLower] = table.table_name;

        // file.cio is parsed separately by parseFileCio() in indexer.ts
        if (actualFileNameLower === 'file.cio') { continue; }

        // Decision table files
        if (actualFileNameLower.endsWith('.dtl')) {
            const [rows, dtlRefs] = processDtlFile(filePath, table, fkNullValues);
            if (rows.length > 0) {
                tablesPayload[table.table_name] = rows;
                fkReferences.push(...dtlRefs);
            }
            continue;
        }

        let lines: string[];
        try {
            lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        } catch { continue; }

        const { records, childLineInfo, columns } = parseLinesWithSchema(
            filePath, table, metadata, lines
        );
        if (records.length === 0) { continue; }

        const rowPayload: NativeRow[] = [];
        for (let idx = 0; idx < records.length; idx++) {
            const record = records[idx];
            const rowDict: NativeRow = {
                file: filePath,
                tableName: table.table_name,
                lineNumber: record.lineNumber,
                pkValue: record.pkValue,
                pkValueLower: record.pkValueLower,
                values: { ...record.values },
            };

            if (actualFileName === 'soils.sol') {
                const [vu, cr] = extractSoilsDetails(record, lines);
                Object.assign(rowDict.values, vu);
                if (cr.length > 0) { rowDict.childRows = cr; }
            }

            if (actualFileName === 'plant.ini') {
                const [vu, cr] = extractPlantDetails(lines, childLineInfo, idx);
                Object.assign(rowDict.values, vu);
                if (cr.length > 0) { rowDict.childRows = cr; }
            }

            if (actualFileName === 'management.sch') {
                const [vu, cr] = extractManagementSchDetails(lines, record);
                Object.assign(rowDict.values, vu);
                if (cr.length > 0) { rowDict.childRows = cr; }
            }

            if (actualFileName === 'weather-wgn.cli') {
                const cr = extractWeatherWgnDetails(lines, childLineInfo, idx);
                if (cr.length > 0) { rowDict.childRows = cr; }
            }

            if (actualFileName === 'atmo.cli') {
                const cr = extractAtmoDetails(record, lines);
                if (cr.length > 0) { rowDict.childRows = cr; }
            }

            rowPayload.push(rowDict);
        }

        tablesPayload[table.table_name] = rowPayload;
        fkReferences.push(...buildFkReferences(records, columns, table, filePath, fkNullValues, metadata));

        // management.sch child-line FK references
        if (actualFileName === 'management.sch') {
            for (const record of records) {
                const [numbAuto, numbOps] = getManagementSchCounts(lines, record);
                if (numbAuto <= 0 && numbOps <= 0) { continue; }
                fkReferences.push(
                    ...processManagementSchChildLines(
                        filePath, table, lines, record.lineNumber, numbAuto, numbOps, fkNullValues
                    )
                );
            }
        }
    }

    // ---- Process weather data files by extension ----
    for (const [extension, schemaFile] of Object.entries(WEATHER_DATA_SCHEMA_FILES)) {
        const table = schema?.tables?.[schemaFile];
        if (!table) { continue; }
        try {
            const files = fs.readdirSync(datasetPath);
            for (const file of files) {
                if (!file.toLowerCase().endsWith(extension)) { continue; }
                if (processedFiles.has(file.toLowerCase())) { continue; }
                const fp = path.join(datasetPath, file);
                const [rows, fileMap] = buildWeatherDataRows(fp, table);
                if (rows.length === 0) { continue; }
                const tableName: string = table.table_name;
                if (!tablesPayload[tableName]) { tablesPayload[tableName] = []; }
                tablesPayload[tableName].push(...rows);
                Object.assign(fileTableMap, fileMap);
                processedFiles.add(file.toLowerCase());
            }
        } catch { /* directory read failed – skip */ }
    }

    // ---- Process additional DTL files not already covered by the schema ----
    try {
        const files = fs.readdirSync(datasetPath);
        for (const file of files) {
            if (!file.toLowerCase().endsWith('.dtl')) { continue; }
            if (processedFiles.has(file.toLowerCase())) { continue; }
            const fp = path.join(datasetPath, file);
            const derivedTableName = file.replace(/\./g, '_').replace(/-/g, '_').toLowerCase();
            const dtlTable = { table_name: derivedTableName, file_name: file };
            const [rows, dtlRefs] = processDtlFile(fp, dtlTable, fkNullValues);
            if (rows.length > 0) {
                tablesPayload[derivedTableName] = rows;
                fkReferences.push(...dtlRefs);
            }
        }
    } catch { /* directory read failed – skip */ }

    return {
        tables: tablesPayload,
        fkReferences,
        fileTableMap,
        stats: {
            tableCount: Object.keys(tablesPayload).length,
            fkCount: fkReferences.length,
        },
    };
}
