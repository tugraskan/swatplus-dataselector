/**
 * SWAT+ Input File Indexer
 * 
 * This module builds and manages the dataset-scoped index for SWAT+ input files.
 * It reads TxtInOut files based on the schema and creates an in-memory index
 * for fast FK lookups and navigation.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// Constants for hierarchical file handling
const NUMERIC_VALUE_PATTERN = /^\d+(\.\d+)?$/;
const DEBUG_OUTPUT_LINE_LIMIT = 10;

// TxtInOut metadata interface
interface TxtInOutMetadata {
    metadata_version: string;
    description: string;
    source: string;
    null_sentinel_values: {
        global: string[];
        description: string;
    };
    table_name_to_file_name: { [tableName: string]: string };
    txtinout_fk_behavior: {
        description: string;
        default_target_column: string;
        exceptions: {
            description: string;
            files: string[];
        };
    };
    file_purposes: { [fileName: string]: string };
    file_categories: { [category: string]: string[] };
    common_pointer_patterns: any;
    hierarchical_files?: {
        description: string;
        [fileName: string]: HierarchicalFileConfig | string; // Config objects or description string
    };
}

interface HierarchicalFileConfig {
    description: string;
    structure: {
        main_record_format: string;
        child_line_format: string;
        main_record_identifier: string | null;
        child_line_count_field?: string | null;
        indexing_strategy: string;
    };
}

export interface SchemaColumn {
    name: string;
    db_column: string;
    type: string;
    nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    fk_target?: {
        table: string;
        column: string;
    };
}

export interface SchemaTable {
    file_name: string;
    table_name: string;
    model_class: string;
    has_metadata_line: boolean;
    has_header_line: boolean;
    data_starts_after: number;
    columns: SchemaColumn[];
    primary_keys: string[];
    foreign_keys: Array<{
        column: string;
        db_column: string;
        references: {
            table: string;
            column: string;
        };
    }>;
    notes: string;
}

export interface Schema {
    schema_version: string;
    source: {
        repo: string;
        commit: string;
        generated_on: string;
    };
    tables: { [fileName: string]: SchemaTable };
}

export interface IndexedRow {
    file: string;
    tableName: string;
    lineNumber: number;  // 1-based line number in file
    pkValue: string;     // Primary key value (typically 'id' or 'name')
    values: { [columnName: string]: string };
}

export interface FKReference {
    sourceFile: string;
    sourceTable: string;
    sourceLine: number;
    sourceColumn: string;
    fkValue: string;
    targetTable: string;
    targetColumn: string;
    resolved: boolean;
    targetRow?: IndexedRow;
}

export class SwatIndexer {
    private schema: Schema | null = null;
    private metadata: TxtInOutMetadata | null = null;
    // Note: All index keys (pk_value) are stored in lowercase for case-insensitive FK resolution
    // This handles variations in casing (e.g., "HydCha01" vs "hydcha01") in SWAT+ files
    private index: Map<string, Map<string, IndexedRow>> = new Map(); // table -> pk_value (lowercase) -> row
    private fkReferences: FKReference[] = [];
    private reverseIndex: Map<string, FKReference[]> = new Map(); // target_table:pk_value (lowercase) -> FK references
    private datasetPath: string | null = null;
    private txtInOutPath: string | null = null;
    private tableToFileMap: Map<string, string> = new Map(); // table_name -> file_name
    private fkNullValues: string[] = ['null', '0', '']; // Default, can be overridden by metadata
    private fileCioReferences: Map<string, string> = new Map(); // classification -> actual_filename

    constructor(private context: vscode.ExtensionContext) {
        this.loadSchema();
        this.loadMetadata();
    }

    private loadSchema(): void {
        try {
            const schemaPath = path.join(
                this.context.extensionPath,
                'resources',
                'schema',
                'swatplus-editor-schema.json'
            );
            
            if (!fs.existsSync(schemaPath)) {
                vscode.window.showErrorMessage('SWAT+ schema file not found');
                return;
            }

            const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
            this.schema = JSON.parse(schemaContent);
            
            // Build table name to file name mapping
            if (this.schema) {
                for (const [fileName, tableInfo] of Object.entries(this.schema.tables)) {
                    this.tableToFileMap.set(tableInfo.table_name, fileName);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load SWAT+ schema: ${error}`);
        }
    }

    private loadMetadata(): void {
        try {
            const metadataPath = path.join(
                this.context.extensionPath,
                'resources',
                'schema',
                'txtinout-metadata.json'
            );
            
            if (!fs.existsSync(metadataPath)) {
                console.log('TxtInOut metadata file not found, using defaults');
                return;
            }

            const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
            this.metadata = JSON.parse(metadataContent);
            
            // Update FK null values from metadata
            if (this.metadata && this.metadata.null_sentinel_values) {
                this.fkNullValues = this.metadata.null_sentinel_values.global;
            }

            // Enhance table to file mapping with metadata
            if (this.metadata && this.metadata.table_name_to_file_name) {
                for (const [tableName, fileName] of Object.entries(this.metadata.table_name_to_file_name)) {
                    if (!this.tableToFileMap.has(tableName)) {
                        this.tableToFileMap.set(tableName, fileName);
                    }
                }
            }
        } catch (error) {
            console.log(`Failed to load TxtInOut metadata: ${error}`);
        }
    }

    /**
     * Check if a file is hierarchical (multi-line records)
     */
    private isHierarchicalFile(fileName: string): boolean {
        if (!this.metadata?.hierarchical_files) {
            return false;
        }
        
        // Check if the file is in the hierarchical files list
        // Skip the 'description' key which is metadata
        return fileName in this.metadata.hierarchical_files && fileName !== 'description';
    }

    /**
     * Get hierarchical file configuration
     */
    private getHierarchicalFileConfig(fileName: string): HierarchicalFileConfig | null {
        if (!this.metadata?.hierarchical_files || !this.isHierarchicalFile(fileName)) {
            return null;
        }
        
        return this.metadata.hierarchical_files[fileName] as HierarchicalFileConfig;
    }

    /**
     * Determine the number of child lines for a hierarchical record
     */
    private getChildLineCount(valueMap: { [key: string]: string }, config: HierarchicalFileConfig, fileName: string): number {
        // Check if there's a field that specifies the child line count
        const countField = config.structure.child_line_count_field;
        
        if (countField) {
            // Handle special case for multiple fields (e.g., "numb_auto+numb_ops")
            if (countField.includes('+')) {
                const fields = countField.split('+').map(f => f.trim());
                let totalCount = 0;
                
                for (const field of fields) {
                    if (valueMap[field]) {
                        const count = parseInt(valueMap[field], 10);
                        if (!isNaN(count) && count > 0) {
                            totalCount += count;
                        }
                    }
                }
                
                // Validate the total count
                if (totalCount < 0) {
                    console.warn(`[Indexer] Invalid total child line count in ${fileName}: ${totalCount}`);
                    return 0;
                }
                
                // Sanity check: prevent excessive line skipping
                if (totalCount > 1000) {
                    console.warn(`[Indexer] Suspiciously large child line count in ${fileName}: ${totalCount}. Capping at 1000.`);
                    return 1000;
                }
                
                return totalCount;
            }
            
            // Handle single field case
            if (valueMap[countField]) {
                // Parse the count from the field value
                const count = parseInt(valueMap[countField], 10);
                
                // Validate the count
                if (isNaN(count) || count < 0) {
                    console.warn(`[Indexer] Invalid child line count in ${fileName}: ${valueMap[countField]}`);
                    return 0;
                }
                
                // Sanity check: prevent excessive line skipping
                if (count > 1000) {
                    console.warn(`[Indexer] Suspiciously large child line count in ${fileName}: ${count}. Capping at 1000.`);
                    return 1000;
                }
                
                return count;
            }
        }
        
        // For files without explicit count field, return 0
        // We'll use heuristic detection instead
        return 0;
    }

    /**
     * Check if a line is a main record (vs child line) in a hierarchical file
     * For now, this uses heuristics based on the file format
     */
    private isMainRecordLine(valueMap: { [key: string]: string }, fileName: string, headers: string[]): boolean {
        // For soils.sol: Main record lines have a 'name' field that looks like a valid identifier
        // Child lines (layer data) typically have numeric or null values in the name position
        if (fileName === 'soils.sol') {
            const nameValue = valueMap['name'] || '';
            // Main record has a non-empty name that's not purely numeric
            // This is a heuristic - child lines might have numeric values or be empty in name position
            return nameValue.length > 0 && !NUMERIC_VALUE_PATTERN.test(nameValue);
        }
        
        // For plant.ini: Main record has plnt_cnt field
        if (fileName === 'plant.ini') {
            // If the record has plnt_cnt, it's a main record
            return 'plnt_cnt' in valueMap;
        }
        
        // For decision tables: More complex, for now treat all as main records
        if (fileName.endsWith('.dtl')) {
            return true; // Conservative - don't skip any lines for now
        }
        
        // Default: treat as main record
        return true;
    }

    /**
     * Process child lines for management.sch and extract FK references
     */
    private processManagementSchChildLines(
        filePath: string,
        table: SchemaTable,
        lines: string[],
        startLine: number,
        numb_auto: number,
        numb_ops: number,
        scheduleName: string
    ): void {
        // Operation type to target table mapping
        const opTypeToTable: { [opType: string]: string } = {
            'plnt': 'plant_ini',
            'harv': 'harv_ops',
            'hvkl': 'plant_ini',
            'kill': 'plant_ini',
            'till': 'tillage_til',
            'irrm': 'irr_ops',
            'irra': 'irr_ops',
            'fert': 'fertilizer_frt',
            'frta': 'fertilizer_frt',
            'frtc': 'fertilizer_frt',
            'pest': 'pesticide_pes',
            'pstc': 'pesticide_pes',
            'graz': 'graze_ops'
        };

        let currentLine = startLine;

        // Process first numb_auto lines (decision table references)
        for (let j = 0; j < numb_auto && currentLine < lines.length; j++) {
            const line = lines[currentLine].trim();
            if (line) {
                const dtlName = line.split(/\s+/)[0]; // First token is the dtl name
                if (dtlName && !this.fkNullValues.includes(dtlName)) {
                    this.fkReferences.push({
                        sourceFile: filePath,
                        sourceTable: table.table_name,
                        sourceLine: currentLine + 1,
                        sourceColumn: 'auto_op_dtl',
                        fkValue: dtlName,
                        targetTable: 'lum_dtl',
                        targetColumn: 'name',
                        resolved: false
                    });
                }
            }
            currentLine++;
        }

        // Process next numb_ops lines (explicit operations)
        for (let j = 0; j < numb_ops && currentLine < lines.length; j++) {
            const line = lines[currentLine].trim();
            if (line) {
                const values = line.split(/\s+/);
                if (values.length > 0) {
                    const opType = values[0]; // First field is operation type
                    const opData1 = values.length > 6 ? values[6] : null; // op_data1 is typically the 7th field

                    if (opType && opData1 && opTypeToTable[opType] && !this.fkNullValues.includes(opData1)) {
                        this.fkReferences.push({
                            sourceFile: filePath,
                            sourceTable: table.table_name,
                            sourceLine: currentLine + 1,
                            sourceColumn: `op_data1(${opType})`,
                            fkValue: opData1,
                            targetTable: opTypeToTable[opType],
                            targetColumn: 'name',
                            resolved: false
                        });
                    }
                }
            }
            currentLine++;
        }
    }

    /**
     * Process decision table files (*.dtl) and extract FK references from fp fields
     * DTL structure:
     * - Line 1: Title
     * - Line 2: Number of decision tables
     * - For each decision table:
     *   - Header line: DTBL_NAME, CONDS, ALTS, ACTS
     *   - Conditions section (CONDS lines)
     *   - Actions section (ACTS lines) - contains fp field
     */
    private processDtlFile(
        filePath: string,
        table: SchemaTable,
        lines: string[]
    ): Map<string, IndexedRow> {
        const tableIndex = new Map<string, IndexedRow>();
        
        // Action type to target table mapping for fp field
        const actionTypeToTable: { [actType: string]: string } = {
            'harvest': 'harv_ops',
            'harvest_kill': 'harv_ops',
            'pest_apply': 'chem_app_ops',
            'fertilize': 'chem_app_ops'
        };

        if (lines.length < 2) {
            console.warn(`[Indexer] DTL file ${filePath} has insufficient lines`);
            return tableIndex;
        }

        // Skip title line (line 0)
        // Line 1 contains the number of decision tables
        const numTablesLine = lines[1].trim();
        const numTables = parseInt(numTablesLine, 10);
        
        if (isNaN(numTables) || numTables < 0) {
            console.warn(`[Indexer] DTL file ${filePath} has invalid table count: ${numTablesLine}`);
            return tableIndex;
        }

        let currentLine = 2; // Start after title and count lines

        // Skip blank lines after count
        while (currentLine < lines.length && !lines[currentLine].trim()) {
            currentLine++;
        }

        // Skip the global header line (NAME  CONDS  ALTS  ACTS)
        // This header appears once after the count and before all decision tables
        if (currentLine < lines.length) {
            const possibleHeaderLine = lines[currentLine].trim().toUpperCase();
            if (possibleHeaderLine.startsWith('NAME')) {
                currentLine++; // Skip the global header
            }
        }

        // Process each decision table
        for (let tableIdx = 0; tableIdx < numTables && currentLine < lines.length; tableIdx++) {
            // Skip blank lines before decision table
            while (currentLine < lines.length && !lines[currentLine].trim()) {
                currentLine++;
            }
            
            const headerLine = lines[currentLine].trim();
            if (!headerLine) {
                break; // No more data
            }

            const headerValues = headerLine.split(/\s+/);
            if (headerValues.length < 4) {
                console.warn(`[Indexer] DTL header line ${currentLine + 1} has insufficient values`);
                currentLine++;
                continue;
            }

            const dtblName = headerValues[0];
            const conds = parseInt(headerValues[1], 10) || 0;
            const alts = parseInt(headerValues[2], 10) || 0;
            const acts = parseInt(headerValues[3], 10) || 0;

            // Index the decision table main record
            const row: IndexedRow = {
                file: filePath,
                tableName: table.table_name,
                lineNumber: currentLine + 1,
                pkValue: dtblName,
                values: {
                    'name': dtblName,
                    'conds': conds.toString(),
                    'alts': alts.toString(),
                    'acts': acts.toString()
                }
            };
            // Store with lowercase key for case-insensitive lookup
            tableIndex.set(dtblName.toLowerCase(), row);

            currentLine++; // Move past decision table header

            // Skip conditions section header line (VAR, OBJ, OB_NUM, etc.)
            currentLine++;
            
            // Skip conditions section data lines (conds lines)
            currentLine += conds;

            // Skip actions section header line (ACT_TYP, OBJ, OBJ_NUM, etc.)
            currentLine++;

            // Process actions section data lines (acts lines)
            for (let actIdx = 0; actIdx < acts && currentLine < lines.length; actIdx++) {
                const actionLine = lines[currentLine].trim();
                if (actionLine) {
                    const actionValues = actionLine.split(/\s+/);
                    
                    // Action line structure: act_typ, obj, obj_num, name, option, const, const2, fp, outcome...
                    // fp is at index 7 (8th field)
                    if (actionValues.length > 7) {
                        const actTyp = actionValues[0];
                        const fp = actionValues[7];

                        // Track FK if action type has a mapping and fp is not null
                        if (actTyp && fp && actionTypeToTable[actTyp] && !this.fkNullValues.includes(fp)) {
                            this.fkReferences.push({
                                sourceFile: filePath,
                                sourceTable: table.table_name,
                                sourceLine: currentLine + 1,
                                sourceColumn: `fp(${actTyp})`,
                                fkValue: fp,
                                targetTable: actionTypeToTable[actTyp],
                                targetColumn: 'name',
                                resolved: false
                            });
                        }
                    }
                }
                currentLine++;
            }
        }

        return tableIndex;
    }

    /**
     * Parse file.cio to extract file references
     * This allows us to handle cases where users rename input files
     */
    private parseFileCio(): void {
        this.fileCioReferences.clear();
        
        if (!this.txtInOutPath) {
            return;
        }

        const fileCioPath = path.join(this.txtInOutPath, 'file.cio');
        if (!fs.existsSync(fileCioPath)) {
            console.log('file.cio not found');
            return;
        }

        try {
            const content = fs.readFileSync(fileCioPath, 'utf-8');
            const lines = content.split('\n');
            
            // file.cio actual format:
            // Line 0: Title/description (metadata line)
            // Line 1+: classification_name  file1  file2  file3  ...
            // Column 0 is classification name, columns 1+ are filenames
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('#')) {
                    continue;
                }
                
                // Parse the line - split by whitespace
                const parts = line.split(/\s+/);
                
                // Skip classification name (column 0), process filenames from column 1 onwards
                for (let j = 1; j < parts.length; j++) {
                    const part = parts[j];
                    
                    // Check if it looks like a filename (has extension) and not null
                    if (part.includes('.') && part !== 'null') {
                        const filename = part;
                        // Store with the filename as both key and value
                        // This allows us to track which files are actually referenced
                        this.fileCioReferences.set(filename, filename);
                    }
                }
            }
            
            console.log(`Parsed file.cio: ${this.fileCioReferences.size} file references found`);
        } catch (error) {
            console.error(`Error parsing file.cio: ${error}`);
        }
    }

    /**
     * Build the index using the pandas helper script for tabular processing
     */
    private buildIndexWithPandas(datasetPath: string): { success: boolean; tableCount: number; fkCount: number; error?: string } {
        const scriptPath = path.join(this.context.extensionPath, 'scripts', 'pandas_indexer.py');
        if (!fs.existsSync(scriptPath)) {
            console.log('[Indexer] pandas_indexer.py not found, skipping pandas pipeline');
            return { success: false, tableCount: 0, fkCount: 0, error: 'Indexer script not found' };
        }

        const schemaPath = path.join(this.context.extensionPath, 'resources', 'schema', 'swatplus-editor-schema.json');
        const metadataPath = path.join(this.context.extensionPath, 'resources', 'schema', 'txtinout-metadata.json');
        const txtInOutPath = this.txtInOutPath ?? datasetPath;

        const pythonExecutable = process.env.SWATPLUS_PYTHON || 'python3';
        const args = [scriptPath, '--dataset', txtInOutPath, '--schema', schemaPath, '--metadata', metadataPath];

        console.log(`[Indexer] Attempting pandas-backed indexing via ${pythonExecutable}`);
        const result = spawnSync(pythonExecutable, args, { encoding: 'utf-8' });

        if (result.error) {
            console.warn(`[Indexer] pandas pipeline failed to start: ${result.error.message}`);
            return { success: false, tableCount: 0, fkCount: 0, error: `Python not found or failed to start: ${result.error.message}` };
        }

        if (result.status !== 0) {
            console.warn(`[Indexer] pandas pipeline exited with code ${result.status}: ${result.stderr}`);
            const errorMsg = result.stderr || 'Unknown error';
            return { success: false, tableCount: 0, fkCount: 0, error: `Indexer failed: ${errorMsg}` };
        }

        try {
            const payload = JSON.parse(result.stdout);

            this.index.clear();
            this.fkReferences = [];
            this.reverseIndex.clear();

            for (const [tableName, rows] of Object.entries(payload.tables || {})) {
                const tableIndex = new Map<string, IndexedRow>();
                (rows as IndexedRow[]).forEach((row) => {
                    tableIndex.set(row.pkValue.toLowerCase(), row);
                });
                this.index.set(tableName, tableIndex);
            }

            this.fkReferences = (payload.fkReferences || []) as FKReference[];

            return {
                success: true,
                tableCount: this.index.size,
                fkCount: this.fkReferences.length,
            };
        } catch (error) {
            console.warn(`[Indexer] Unable to parse pandas pipeline output: ${error}`);
            return { success: false, tableCount: 0, fkCount: 0, error: `Failed to parse indexer output: ${error}` };
        }
    }

    /**
     * Build index for the given dataset path
     */
    public async buildIndex(datasetPath: string): Promise<boolean> {
        if (!this.schema) {
            vscode.window.showErrorMessage('Schema not loaded');
            return false;
        }

        this.datasetPath = datasetPath;
        
        // Check for TxtInOut subdirectory first, then fall back to direct folder
        const txtInOutSubdir = path.join(datasetPath, 'TxtInOut');
        if (fs.existsSync(txtInOutSubdir)) {
            this.txtInOutPath = txtInOutSubdir;
        } else if (fs.existsSync(path.join(datasetPath, 'file.cio'))) {
            // Files are directly in the dataset folder (common SWAT+ layout)
            this.txtInOutPath = datasetPath;
        } else {
            vscode.window.showErrorMessage(
                `No SWAT+ input files found in ${datasetPath}. ` +
                'Please ensure this is a valid SWAT+ dataset folder (should contain file.cio).'
            );
            return false;
        }

        // Clear existing index
        this.index.clear();
        this.fkReferences = [];
        this.reverseIndex.clear();

        // Show progress
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Building SWAT+ Inputs Index',
            cancellable: true
        }, async (progress, token) => {
            // Parse file.cio first to get the actual file references
            // This is important in case users have renamed input files
            progress.report({ message: 'Parsing file.cio...', increment: 0 });
            this.parseFileCio();

            // Use pandas-backed indexing (required)
            const pandasResult = this.buildIndexWithPandas(datasetPath);
            if (!pandasResult.success) {
                const errorDetail = pandasResult.error || 'Unknown error';
                vscode.window.showErrorMessage(
                    `Failed to build index: ${errorDetail}. ` +
                    'Check the Output panel for details.'
                );
                return false;
            }

            progress.report({ message: 'Resolving foreign key references...' });
            this.resolveFKReferences();

            vscode.window.showInformationMessage(
                `Index built successfully: ${pandasResult.tableCount} tables, ${this.fkReferences.length} FK references`
            );

            await this.context.workspaceState.update(`index:${datasetPath}`, {
                built: true,
                timestamp: new Date().toISOString(),
                tableCount: pandasResult.tableCount,
                fkCount: this.fkReferences.length
            });

            return true;
        });
    }

    /**
     * Index a single table from its TxtInOut file
     */
    private async indexTable(table: SchemaTable): Promise<void> {
        const filePath = path.join(this.txtInOutPath!, table.file_name);
        
        if (!fs.existsSync(filePath)) {
            console.log(`File not found: ${filePath}`);
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            // Special handling for decision table files (*.dtl)
            if (table.file_name.endsWith('.dtl')) {
                console.log(`[Indexer] Processing DTL file ${table.file_name} with custom parser`);
                const tableIndex = this.processDtlFile(filePath, table, lines);
                this.index.set(table.table_name, tableIndex);
                return;
            }

            // Parse header line to map column positions
            const headerLineIndex = table.has_metadata_line ? 1 : 0;
            if (lines.length <= headerLineIndex) {
                console.warn(`File too short: ${filePath}`);
                return;
            }

            const headerLine = lines[headerLineIndex];
            const headers = headerLine.trim().split(/\s+/);

            // Index data rows
            const dataStartLine = table.data_starts_after;
            const tableIndex = new Map<string, IndexedRow>();
            
            // Check if this is a hierarchical file
            const isHierarchical = this.isHierarchicalFile(table.file_name);
            const hierarchicalConfig = isHierarchical ? this.getHierarchicalFileConfig(table.file_name) : null;
            
            console.log(`[Indexer] Indexing ${table.table_name} (${path.basename(filePath)}), data starts at line ${dataStartLine}, headers: ${headers.join(', ')}${isHierarchical ? ' (HIERARCHICAL)' : ''}`);

            let i = dataStartLine;
            while (i < lines.length) {
                const line = lines[i].trim();
                if (!line) {
                    i++;
                    continue;
                }

                const values = line.split(/\s+/).map(v => v.trim()); // Trim each value
                
                // Build value map
                const valueMap: { [key: string]: string } = {};
                for (let j = 0; j < headers.length && j < values.length; j++) {
                    valueMap[headers[j]] = values[j];
                }
                
                // Fill in missing columns with empty strings
                // This handles cases where data rows have fewer values than headers
                // (e.g., optional trailing columns like 'description')
                for (let j = values.length; j < headers.length; j++) {
                    valueMap[headers[j]] = '';
                }

                // For hierarchical files, determine if this is a main record or child line
                let skipCount = 0;
                if (isHierarchical && hierarchicalConfig) {
                    // First, try explicit child count (e.g., plant.ini with plnt_cnt field)
                    const explicitCount = this.getChildLineCount(valueMap, hierarchicalConfig, table.file_name);
                    
                    if (explicitCount > 0) {
                        // This file has explicit child counts - use them
                        // The current line is a main record, and we'll skip children after processing
                        skipCount = explicitCount;
                    } else {
                        // No explicit count - use heuristic detection (e.g., soils.sol)
                        const isMainRecord = this.isMainRecordLine(valueMap, table.file_name, headers);
                        if (!isMainRecord) {
                            // This is a child line - skip it
                            if (i - dataStartLine < DEBUG_OUTPUT_LINE_LIMIT) {
                                console.log(`[Indexer]   Skipping child line ${i + 1}`);
                            }
                            i++;
                            continue;
                        }
                    }
                }

                // Get primary key value
                // Try schema PK first, but fall back to 'name' if PK not in file headers
                let pkColumn = table.primary_keys[0] || 'id';
                if (!headers.includes(pkColumn)) {
                    // PK from schema not in file (e.g., 'id' not written to TxtInOut)
                    // Fall back to 'name' which is the common identifier in SWAT+ files
                    pkColumn = 'name';
                }
                const pkValue = valueMap[pkColumn] || '';
                
                // Log first few rows for debugging
                if (i - dataStartLine < 3) {
                    console.log(`[Indexer]   Row ${i + 1}: pkColumn=${pkColumn}, pkValue="${pkValue}" (length=${pkValue.length}), first few values: ${JSON.stringify(Object.fromEntries(Object.entries(valueMap).slice(0, 5)))}`);
                }

                const row: IndexedRow = {
                    file: filePath,
                    tableName: table.table_name,
                    lineNumber: i + 1,  // 1-based
                    pkValue,
                    values: valueMap
                };

                // Store with lowercase key for case-insensitive lookup
                tableIndex.set(pkValue.toLowerCase(), row);

                // Record FK references
                // In TxtInOut files, FK values typically reference 'name' column in target, not 'id'
                for (const fk of table.foreign_keys) {
                    const fkValue = valueMap[fk.column];
                    if (fkValue && !this.fkNullValues.includes(fkValue)) {
                        // Use metadata to determine the actual target column in TxtInOut files
                        // Default is 'name' for TxtInOut files, not 'id' from the database schema
                        const txtinoutTargetColumn = this.metadata?.txtinout_fk_behavior?.default_target_column || 'name';
                        
                        this.fkReferences.push({
                            sourceFile: filePath,
                            sourceTable: table.table_name,
                            sourceLine: i + 1,
                            sourceColumn: fk.column,
                            fkValue,
                            targetTable: fk.references.table,
                            targetColumn: txtinoutTargetColumn,  // Use 'name' for TxtInOut files
                            resolved: false
                        });
                    }
                }

                // Skip child lines if we have an explicit count (e.g., plant.ini, management.sch)
                if (skipCount > 0) {
                    // Special handling for management.sch to track FK references in child lines
                    if (table.file_name === 'management.sch') {
                        const numb_auto = parseInt(valueMap['numb_auto'] || '0', 10);
                        const numb_ops = parseInt(valueMap['numb_ops'] || '0', 10);
                        console.log(`[Indexer]   Processing ${skipCount} child lines for management schedule "${pkValue}" (${numb_auto} auto ops, ${numb_ops} explicit ops)`);
                        this.processManagementSchChildLines(filePath, table, lines, i + 1, numb_auto, numb_ops, pkValue);
                    } else {
                        console.log(`[Indexer]   Skipping ${skipCount} child lines for record "${pkValue}"`);
                    }
                    i += skipCount;
                }

                i++;
            }

            this.index.set(table.table_name, tableIndex);
        } catch (error) {
            console.error(`Error indexing ${filePath}:`, error);
        }
    }

    /**
     * Resolve FK references by looking up target rows and build reverse index
     */
    private resolveFKReferences(): void {
        // Clear reverse index
        this.reverseIndex.clear();
        
        console.log(`[Indexer] Resolving ${this.fkReferences.length} FK references...`);
        let resolvedCount = 0;
        let unresolvedCount = 0;
        
        for (const fkRef of this.fkReferences) {
            let targetRow: IndexedRow | undefined;
            let actualTargetTable = fkRef.targetTable;
            
            // Special handling for decision table references
            // Decision tables can be in any *.dtl file, so we search across all DTL tables
            if (fkRef.sourceColumn === 'auto_op_dtl' || fkRef.targetTable.includes('dtl')) {
                targetRow = this.resolveDecisionTable(fkRef.fkValue);
                if (targetRow) {
                    // Update the actual target table to the one where we found it
                    actualTargetTable = targetRow.tableName;
                }
            } else {
                // Standard FK resolution with case-insensitive lookup
                const targetTableIndex = this.index.get(fkRef.targetTable);
                if (targetTableIndex) {
                    targetRow = targetTableIndex.get(fkRef.fkValue.toLowerCase());
                }
            }
            
            if (targetRow) {
                fkRef.resolved = true;
                fkRef.targetRow = targetRow;
                resolvedCount++;
                
                // Build reverse index: target_table:pk_value -> FK references (case-insensitive)
                const reverseKey = `${actualTargetTable}:${fkRef.fkValue.toLowerCase()}`;
                if (!this.reverseIndex.has(reverseKey)) {
                    this.reverseIndex.set(reverseKey, []);
                }
                this.reverseIndex.get(reverseKey)!.push(fkRef);
            } else {
                unresolvedCount++;
                const targetTableIndex = this.index.get(fkRef.targetTable);
                if (!targetTableIndex && !(fkRef.sourceColumn === 'auto_op_dtl')) {
                    // Log missing target table (but not for decision tables since they might be in any DTL file)
                    if (unresolvedCount <= 5) {
                        console.log(`[Indexer]   Unresolved FK (table not indexed): ${fkRef.sourceColumn}="${fkRef.fkValue}" -> ${fkRef.targetTable}`);
                    }
                } else if (targetTableIndex) {
                    // Log unresolved FK with debugging info
                    if (unresolvedCount <= 10) {
                        const indexedKeys = Array.from(targetTableIndex.keys()).slice(0, 10);
                        console.log(`[Indexer]   Unresolved FK: ${fkRef.sourceColumn}="${fkRef.fkValue}" (length=${fkRef.fkValue.length}) -> ${fkRef.targetTable}`);
                        console.log(`[Indexer]     Indexed keys (first 10): ${indexedKeys.map(k => `"${k}" (len=${k.length})`).join(', ')}`);
                        console.log(`[Indexer]     FK value bytes: [${Array.from(fkRef.fkValue).map(c => c.charCodeAt(0)).join(', ')}]`);
                        if (indexedKeys.length > 0) {
                            console.log(`[Indexer]     First key bytes: [${Array.from(indexedKeys[0]).map(c => c.charCodeAt(0)).join(', ')}]`);
                        }
                    }
                } else if (fkRef.sourceColumn === 'auto_op_dtl') {
                    // Decision table not found in any DTL file
                    if (unresolvedCount <= 10) {
                        console.log(`[Indexer]   Unresolved FK: ${fkRef.sourceColumn}="${fkRef.fkValue}" (decision table not found in any DTL file)`);
                    }
                }
            }
        }
        
        console.log(`[Indexer] FK resolution complete: ${resolvedCount} resolved, ${unresolvedCount} unresolved`);
    }

    /**
     * Rebuild the index (clear and rebuild)
     */
    public async rebuildIndex(): Promise<boolean> {
        if (!this.datasetPath) {
            vscode.window.showWarningMessage('No dataset indexed yet');
            return false;
        }

        return this.buildIndex(this.datasetPath);
    }

    /**
     * Check if index exists for a dataset
     */
    public async hasIndex(datasetPath: string): Promise<boolean> {
        const indexState = this.context.workspaceState.get(`index:${datasetPath}`);
        return indexState !== undefined;
    }

    /**
     * Get FK references for a specific file and line
     */
    public getFKReferencesForLine(filePath: string, lineNumber: number): FKReference[] {
        return this.fkReferences.filter(
            ref => ref.sourceFile === filePath && ref.sourceLine === lineNumber
        );
    }

    /**
     * Get unresolved FK references (for diagnostics)
     */
    public getUnresolvedFKReferences(): FKReference[] {
        return this.fkReferences.filter(ref => !ref.resolved);
    }

    /**
     * Get all FK references
     */
    public getAllFKReferences(): FKReference[] {
        return [...this.fkReferences];
    }

    /**
     * Look up a FK target location
     */
    public resolveFKTarget(tableName: string, pkValue: string): IndexedRow | undefined {
        const tableIndex = this.index.get(tableName);
        return tableIndex?.get(pkValue.toLowerCase());
    }

    /**
     * Look up a decision table across all indexed DTL files
     * Decision tables can be in any *.dtl file, so we search all DTL tables
     */
    public resolveDecisionTable(dtlName: string): IndexedRow | undefined {
        // Search through all indexed tables with case-insensitive lookup
        const lowerDtlName = dtlName.toLowerCase();
        for (const [tableName, tableIndex] of this.index.entries()) {
            // Check if this is a DTL table (table name typically contains 'dtl')
            if (tableName.includes('dtl')) {
                const row = tableIndex.get(lowerDtlName);
                if (row) {
                    return row;
                }
            }
        }
        return undefined;
    }

    /**
     * Get schema for extension use
     */
    public getSchema(): Schema | null {
        return this.schema;
    }

    /**
     * Get file name for a table name
     */
    public getFileNameForTable(tableName: string): string | undefined {
        return this.tableToFileMap.get(tableName);
    }

    /**
     * Check if index is built
     */
    public isIndexBuilt(): boolean {
        return this.index.size > 0;
    }

    /**
     * Check if a specific table is indexed
     */
    public isTableIndexed(tableName: string): boolean {
        return this.index.has(tableName);
    }

    /**
     * Get current dataset path
     */
    public getDatasetPath(): string | null {
        return this.datasetPath;
    }

    public getTxtInOutPath(): string | null {
        return this.txtInOutPath;
    }

    /**
     * Get file purpose from metadata
     */
    public getFilePurpose(fileName: string): string | undefined {
        return this.metadata?.file_purposes?.[fileName];
    }

    /**
     * Get file category from metadata
     */
    public getFileCategory(fileName: string): string | undefined {
        if (!this.metadata?.file_categories) {
            return undefined;
        }
        
        for (const [category, files] of Object.entries(this.metadata.file_categories)) {
            if (files.includes(fileName)) {
                return category;
            }
        }
        return undefined;
    }

    /**
     * Get metadata for extension use
     */
    public getMetadata(): TxtInOutMetadata | null {
        return this.metadata;
    }

    /**
     * Get all FK references that point to a specific row
     * (reverse lookup - find what references this row)
     */
    public getReferencesToRow(tableName: string, pkValue: string): FKReference[] {
        const reverseKey = `${tableName}:${pkValue.toLowerCase()}`;
        return this.reverseIndex.get(reverseKey) || [];
    }

    /**
     * Get all FK references from a specific file
     */
    public getFKReferencesFromFile(filePath: string): FKReference[] {
        return this.fkReferences.filter(ref => ref.sourceFile === filePath);
    }

    /**
     * Get statistics about the index
     */
    public getIndexStats(): {
        tableCount: number;
        rowCount: number;
        fkCount: number;
        resolvedFkCount: number;
        unresolvedFkCount: number;
    } {
        let rowCount = 0;
        for (const tableIndex of this.index.values()) {
            rowCount += tableIndex.size;
        }
        
        const resolvedCount = this.fkReferences.filter(ref => ref.resolved).length;
        
        return {
            tableCount: this.index.size,
            rowCount,
            fkCount: this.fkReferences.length,
            resolvedFkCount: resolvedCount,
            unresolvedFkCount: this.fkReferences.length - resolvedCount
        };
    }

    /**
     * Get file references from file.cio
     * Returns map of filename -> filename
     */
    public getFileCioReferences(): Map<string, string> {
        return new Map(this.fileCioReferences);
    }

    /**
     * Check if a file is referenced in file.cio
     */
    public isFileReferencedInCio(filename: string): boolean {
        return this.fileCioReferences.has(filename);
    }
}
