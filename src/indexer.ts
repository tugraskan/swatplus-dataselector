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
import * as os from 'os';
import { normalizePathForComparison, resolveFileCioPath } from './pathUtils';

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
    file_pointer_columns?: { [fileName: string]: any };
    file_metadata?: { 
        [fileName: string]: {
            description: string;
            metadata_structure: string;
            special_structure: boolean;
            primary_keys: string[];
        }
    };
    foreign_key_relationships?: { [fileName: string]: any };
    enhanced_from_markdown?: boolean;
    markdown_sources?: string[];
    enhanced_schema_available?: boolean;
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

export interface FileCioHeaderInfo {
    editorVersion?: string;
    swatRevision?: string;
    generatedOn?: string;
    raw?: string;
}

export interface IndexedRow {
    file: string;
    tableName: string;
    lineNumber: number;  // 1-based line number in file
    pkValue: string;     // Primary key value (typically 'id' or 'name')
    pkValueLower?: string; // Lowercased primary key value for faster lookups
    values: { [columnName: string]: string };
    childRows?: Array<{ lineNumber: number; values: { [columnName: string]: string } }>; // For hierarchical files like weather-wgn.cli
}

export interface FKReference {
    sourceFile: string;
    sourceTable: string;
    sourceLine: number;
    sourceColumn: string;
    fkValue: string;
    fkValueLower?: string;
    targetTable: string;
    targetColumn: string;
    resolved: boolean;
    targetRow?: IndexedRow;
}

export class SwatIndexer {
    private schema: Schema | null = null;
    private metadata: TxtInOutMetadata | null = null;
    private gitbookUrls: { default_url: string; file_urls: { [fileName: string]: string } } | null = null;
    // Note: All index keys (pk_value) are stored in lowercase for case-insensitive FK resolution
    // This handles variations in casing (e.g., "HydCha01" vs "hydcha01") in SWAT+ files
    private index: Map<string, Map<string, IndexedRow>> = new Map(); // table -> pk_value (lowercase) -> row
    private fkReferences: FKReference[] = [];
    private reverseIndex: Map<string, FKReference[]> = new Map(); // target_table:pk_value (lowercase) -> FK references
    private datasetPath: string | null = null;
    private txtInOutPath: string | null = null;
    private tableToFileMap: Map<string, string> = new Map(); // table_name -> file_name
    private fileToTableMap: Map<string, string> = new Map(); // file_name -> table_name (lowercase)
    private dynamicFileToTableMap: Map<string, string> = new Map(); // runtime file_name -> table_name
    private fkNullValues: string[] = ['null', '0', '']; // Default, can be overridden by metadata
    // file.cio data indexed by classification
    // Structure: classification -> { files: string[], isDefault: boolean[] }
    private fileCioData: Map<string, { files: string[], isDefault: boolean[] }> = new Map();
    private decisionTableIndex: Map<string, IndexedRow> = new Map(); // dtl name (lowercase) -> row
    private readonly indexCacheFileName = 'index.json';
    private schemaPathOverride: string | null = null;
    private fileCioHeader: FileCioHeaderInfo | null = null;

    constructor(private context: vscode.ExtensionContext) {
        const storedSchemaPath = this.context.workspaceState.get<string>('swatplus.schemaPath');
        this.schemaPathOverride = storedSchemaPath || null;
        this.loadSchema();
        this.loadMetadata();
        this.loadGitbookUrls();
    }

    private loadSchema(): void {
        try {
            const schemaPath = this.resolveSchemaPath();
            
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
                    this.fileToTableMap.set(fileName.toLowerCase(), tableInfo.table_name);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load SWAT+ schema: ${error}`);
        }
    }

    private resolveSchemaPath(): string {
        if (this.schemaPathOverride) {
            return this.schemaPathOverride;
        }
        return path.join(
            this.context.extensionPath,
            'resources',
            'schema',
            'swatplus-editor-schema.json'
        );
    }

    public setSchemaPath(schemaPath: string | null): void {
        this.schemaPathOverride = schemaPath || null;
        this.context.workspaceState.update('swatplus.schemaPath', this.schemaPathOverride);
        this.loadSchema();
    }

    public getSchemaPath(): string {
        return this.resolveSchemaPath();
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
                    this.tableToFileMap.set(tableName, fileName);
                    this.fileToTableMap.set(fileName.toLowerCase(), tableName);
                }
            }
        } catch (error) {
            console.log(`Failed to load TxtInOut metadata: ${error}`);
        }
    }

    private setDatasetPaths(datasetPath: string): boolean {
        this.datasetPath = datasetPath;

        const txtInOutSubdir = path.join(datasetPath, 'TxtInOut');
        if (fs.existsSync(txtInOutSubdir)) {
            this.txtInOutPath = txtInOutSubdir;
            return true;
        }

        if (resolveFileCioPath(datasetPath)) {
            this.txtInOutPath = datasetPath;
            return true;
        }

        vscode.window.showErrorMessage(
            `No SWAT+ input files found in ${datasetPath}. ` +
            'Please ensure this is a valid SWAT+ dataset folder (should contain file.cio).'
        );
        return false;
    }

    private loadGitbookUrls(): void {
        try {
            const urlsPath = path.join(
                this.context.extensionPath,
                'resources',
                'schema',
                'gitbook-urls.json'
            );
            
            if (!fs.existsSync(urlsPath)) {
                console.log('GitBook URLs file not found');
                return;
            }

            const urlsContent = fs.readFileSync(urlsPath, 'utf-8');
            this.gitbookUrls = JSON.parse(urlsContent);
        } catch (error) {
            console.log(`Failed to load GitBook URLs: ${error}`);
        }
    }

    /**
     * Parse file.cio to extract file references organized by classification
     * Format: classification_name  file1  file2  file3  ...
     * where files can be actual filenames or 'null' if not used
     * 
     * The data is stored in two ways:
     * 1. fileCioData: classification-based structure for API access
     * 2. index: schema-based structure (one row per file) for table viewer
     */
    private parseFileCio(): void {
        this.fileCioData.clear();
        
        if (!this.txtInOutPath) {
            return;
        }

        const fileCioPath = resolveFileCioPath(this.txtInOutPath);
        if (!fileCioPath) {
            console.log('file.cio not found');
            return;
        }

        try {
            const content = fs.readFileSync(fileCioPath, 'utf-8');
            const lines = content.split('\n');
            this.fileCioHeader = this.parseFileCioHeader(lines[0] || '');
            
            // file.cio actual format:
            // Line 0: Title/description (metadata line)
            // Line 1+: classification_name  file1  file2  file3  ...
            // Column 0 is classification name, columns 1+ are filenames
            
            const DEFAULT_CUSTOMIZATION = '0'; // Default customization value
            let totalFileReferences = 0;
            let rowId = 1; // Auto-incrementing ID for schema compatibility
            
            // Ensure file_cio table exists in index (clear any existing data)
            const tableName = 'file_cio';
            if (this.index.has(tableName)) {
                this.index.get(tableName)!.clear();
            } else {
                this.index.set(tableName, new Map());
            }
            const tableIndex = this.index.get(tableName)!;
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('#')) {
                    continue;
                }
                
                // Parse the line - split by whitespace
                const parts = line.split(/\s+/);
                
                if (parts.length < 2) {
                    // Need at least classification and one file
                    continue;
                }
                
                const classification = parts[0];
                const files: string[] = [];
                const isDefault: boolean[] = [];
                
                // Process filenames from column 1 onwards
                for (let j = 1; j < parts.length; j++) {
                    const filename = parts[j];
                    files.push(filename);
                    
                    // Check if this is a default/null value
                    const filenameLower = filename.toLowerCase();
                    const isNullValue = filenameLower === 'null' || 
                                       filename === '' || 
                                       this.fkNullValues.includes(filenameLower);
                    isDefault.push(isNullValue);
                    
                    if (!isNullValue && filename.includes('.')) {
                        totalFileReferences++;
                    }
                    
                    // Create a row for each file in schema format
                    // This allows the table viewer to display the data correctly
                    const rowIdStr = rowId.toString();
                    
                    // Calculate relative path from workspace to file.cio
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    let relativeFilePath = 'file.cio';
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        relativeFilePath = path.relative(workspaceFolders[0].uri.fsPath, fileCioPath);
                    }
                    
                    const indexedRow: IndexedRow = {
                        file: relativeFilePath,
                        tableName: tableName,
                        lineNumber: i + 1,
                        pkValue: rowIdStr,
                        values: {
                            id: rowIdStr,
                            classification: classification,
                            order_in_class: j.toString(),
                            file_name: filename,
                            customization: DEFAULT_CUSTOMIZATION
                        }
                    };
                    
                    tableIndex.set(rowIdStr, indexedRow);
                    rowId++;
                }
                
                // Store the classification data for API access
                this.fileCioData.set(classification.toLowerCase(), { files, isDefault });
            }
            
            console.log(`Parsed file.cio: ${this.fileCioData.size} classifications, ${totalFileReferences} file references found, ${rowId - 1} rows indexed`);
        } catch (error) {
            console.error(`Error parsing file.cio: ${error}`);
        }
    }

    public updateFileCioHeader(datasetPath: string): void {
        const fileCioPath = resolveFileCioPath(datasetPath);
        if (!fileCioPath) {
            this.fileCioHeader = null;
            return;
        }

        try {
            const content = fs.readFileSync(fileCioPath, 'utf-8');
            const lines = content.split('\n');
            this.fileCioHeader = this.parseFileCioHeader(lines[0] || '');
        } catch (error) {
            console.error(`Error reading file.cio header: ${error}`);
            this.fileCioHeader = null;
        }
    }

    public getFileCioHeaderInfo(): FileCioHeaderInfo | null {
        return this.fileCioHeader;
    }

    private parseFileCioHeader(headerLine: string): FileCioHeaderInfo {
        const info: FileCioHeaderInfo = {
            raw: headerLine.trim() || undefined
        };
        if (!headerLine) {
            return info;
        }

        const editorMatch = headerLine.match(/written\s+by\s+SWAT\+\s*editor\s*v?([0-9.]+)/i);
        if (editorMatch) {
            info.editorVersion = editorMatch[1];
        }

        const revisionMatch = headerLine.match(/for\s+SWAT\+\s*rev\.?([0-9.]+)/i);
        if (revisionMatch) {
            info.swatRevision = revisionMatch[1];
        }

        const dateMatch = headerLine.match(/on\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9:]{2,5})/i);
        if (dateMatch) {
            info.generatedOn = dateMatch[1];
        }

        return info;
    }

    /**
     * Build the index using TypeScript-based file parsing (no Python required)
     */
    private buildIndexWithTypeScript(datasetPath: string): { success: boolean; tableCount: number; fkCount: number; error?: string } {
        if (!this.schema) {
            return { success: false, tableCount: 0, fkCount: 0, error: 'Schema not loaded' };
        }

        const txtInOutPath = this.txtInOutPath ?? datasetPath;
        if (!fs.existsSync(txtInOutPath)) {
            return { success: false, tableCount: 0, fkCount: 0, error: `Dataset path not found: ${txtInOutPath}` };
        }

        try {
            this.index.clear();
            this.fkReferences = [];
            this.reverseIndex.clear();
            this.decisionTableIndex.clear();
            this.dynamicFileToTableMap.clear();

            console.log('[Indexer] Starting TypeScript-based indexing...');
            console.log(`[Indexer] Dataset path: ${txtInOutPath}`);
            console.log(`[Indexer] Schema tables: ${Object.keys(this.schema.tables).length}`);

            let totalFKCount = 0;

            // Process each table in the schema
            for (const table of Object.values(this.schema.tables)) {
                const fileName = table.file_name;
                const tableName = table.table_name;
                const filePath = path.join(txtInOutPath, fileName);

                if (!fs.existsSync(filePath)) {
                    console.log(`[Indexer] File not found, skipping: ${fileName}`);
                    continue;
                }

                try {
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const lines = fileContent.split('\n');

                    // Parse the file based on schema
                    const { rows, fkRefs, fileTableMap } = this.parseSchemaFile(filePath, table, lines);

                    // Store rows in index
                    if (rows.length > 0) {
                        const tableIndex = new Map<string, IndexedRow>();
                        for (const row of rows) {
                            const pkValueLower = row.pkValueLower ?? row.pkValue.toLowerCase();
                            tableIndex.set(pkValueLower, row);
                            if (tableName.includes('dtl')) {
                                this.decisionTableIndex.set(pkValueLower, row);
                            }
                        }
                        this.index.set(tableName, tableIndex);
                        console.log(`[Indexer] ✓ ${fileName}: ${rows.length} rows, ${fkRefs.length} FK refs`);
                    } else {
                        console.log(`[Indexer] ✗ ${fileName}: No rows parsed (0 data lines or all filtered)`);
                    }

                    // Collect FK references
                    for (const fkRef of fkRefs) {
                        this.fkReferences.push(fkRef);
                        totalFKCount++;
                    }

                    // Update file to table mapping
                    if (fileTableMap) {
                        this.dynamicFileToTableMap.set(fileName.toLowerCase(), tableName);
                    }
                } catch (error) {
                    console.error(`[Indexer] ERROR parsing ${fileName}: ${error}`);
                }
            }

            // Parse file.cio separately (handled later in buildIndex via parseFileCio)
            console.log(`[Indexer] TypeScript indexing complete: ${this.index.size} tables, ${totalFKCount} FK references`);

            return {
                success: true,
                tableCount: this.index.size,
                fkCount: totalFKCount,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[Indexer] TypeScript indexer fatal error: ${errorMsg}`, error);
            return { success: false, tableCount: 0, fkCount: 0, error: errorMsg };
        }
    }

    /**
     * Parse a single file based on schema definition
     */
    private parseSchemaFile(filePath: string, table: SchemaTable, lines: string[]): {
        rows: IndexedRow[];
        fkRefs: FKReference[];
        fileTableMap: boolean;
    } {
        try {
            const fileName = path.basename(filePath);
            const fkNullValues = this.fkNullValues ?? [];
            const nullSet = new Set(fkNullValues.map(v => v.toLowerCase()));
            
            // Check if this is a hierarchical file
            const isHierarchical = this.metadata?.hierarchical_files && fileName in this.metadata.hierarchical_files;
            const config = isHierarchical ? this.metadata!.hierarchical_files![fileName] : null;

            // Handle hierarchical files
            if (isHierarchical && config && config !== 'description') {
                let columnNames = table.columns.map(c => c.name);
                let startLine = Math.max(table.data_starts_after, 0);
                
                // Extract actual column names from header line if present
                if (table.has_header_line && startLine > 0 && startLine - 1 < lines.length) {
                    // Header is at line startLine - 1
                    const headerLine = lines[startLine - 1].trim();
                    if (headerLine && !headerLine.match(/^\d+/) && !headerLine.match(/^-?\d+\.?\d*/)) {
                        // Parse header line to get column names
                        const headerColumns = headerLine.split(/\s+/).filter(col => col.length > 0);
                        if (headerColumns.length > 0) {
                            columnNames = headerColumns;
                            if (fileName === 'plant.ini') {
                                console.log(`[Indexer] ${fileName}: Extracted header columns: ${columnNames.slice(0, 10).join(', ')}${columnNames.length > 10 ? '...' : ''}`);
                            }
                        }
                    }
                }
                
                const result = this.parseHierarchicalFile(filePath, table, lines, columnNames, startLine, nullSet);
                if (result.rows.length > 0) {
                    return result;
                }
                // Fall back to standard parsing if hierarchical fails
            }

            // Parse as standard tabular file
            if (fileName.endsWith('.dtl')) {
                // Handle decision table files
                return this.parseDecisionTableFile(filePath, table, lines);
            } else {
                // Standard tabular parsing
                return this.parseStandardFile(filePath, table, lines, nullSet);
            }
        } catch (error) {
            console.error(`[Indexer] parseSchemaFile error for ${table.table_name}: ${error}`);
            return { rows: [], fkRefs: [], fileTableMap: false };
        }
    }

    /**
     * Parse standard tabular files
     */
    private parseStandardFile(filePath: string, table: SchemaTable, lines: string[], nullSet: Set<string>): {
        rows: IndexedRow[];
        fkRefs: FKReference[];
        fileTableMap: boolean;
    } {
        const fileName = path.basename(filePath);
        const rows: IndexedRow[] = [];
        const fkRefs: FKReference[] = [];
        
        // Use schema column names
        const columnNames = table.columns.map(c => c.name);
        let startLine = Math.max(table.data_starts_after, 0);

        // Don't strictly skip header lines - many SWAT+ files have metadata/headers
        // Just start from data_starts_after line number
        let lineNum = startLine;
        let recordCount = 0;
        
        while (lineNum < lines.length) {
            const line = lines[lineNum].trim();
            lineNum++;

            // Skip only completely empty lines and comments
            if (!line || line.startsWith('#')) {
                continue;
            }

            const values = line.split(/\s+/);
            
            // Skip lines with no fields
            if (values.length === 0) {
                continue;
            }

            // Don't be too strict - allow lines with fewer columns than expected
            // SWAT+ files often have variable-width fields
            const valueMap: { [key: string]: string } = {};

            // Map values to column names using schema
            for (let i = 0; i < columnNames.length && i < values.length; i++) {
                valueMap[columnNames[i]] = values[i];
            }
            
            // For extra columns beyond schema definition, store them
            for (let i = columnNames.length; i < values.length; i++) {
                valueMap[`col${i}`] = values[i];
            }

            // Determine primary key
            let pkValue = this.getPrimaryKey(valueMap, values, table);

            const row: IndexedRow = {
                file: filePath,
                tableName: table.table_name,
                lineNumber: lineNum,
                pkValue,
                pkValueLower: pkValue.toLowerCase(),
                values: valueMap
            };

            rows.push(row);
            recordCount++;

            // Extract FK references
            for (const fk of table.foreign_keys) {
                const fkValue = valueMap[fk.column];
                if (fkValue && fkValue.trim() && !nullSet.has(fkValue.toLowerCase())) {
                    fkRefs.push({
                        sourceFile: filePath,
                        sourceTable: table.table_name,
                        sourceLine: lineNum,
                        sourceColumn: fk.column,
                        fkValue,
                        fkValueLower: fkValue.toLowerCase(),
                        targetTable: fk.references.table,
                        targetColumn: 'name',
                        resolved: false
                    });
                }
            }
        }
        
        if (recordCount === 0) {
            console.log(`[Indexer] ${fileName}: 0 data rows found (may be empty or metadata-only file)`);
        }
        
        return { rows, fkRefs, fileTableMap: true };
    }

    /**
     * Extract primary key from a row
     */
    private getPrimaryKey(valueMap: { [key: string]: string }, values: string[], table: SchemaTable): string {
        const pkColumns = table.primary_keys || [];
        
        // Try schema-defined primary keys first
        for (const pkCol of pkColumns) {
            if (valueMap[pkCol] && valueMap[pkCol].trim()) {
                return valueMap[pkCol];
            }
        }
        
        // Fallbacks for primary key
        const fallbacks = ['name', 'filename', 'id', 'object_id'];
        for (const fallback of fallbacks) {
            if (valueMap[fallback] && valueMap[fallback].trim()) {
                return valueMap[fallback];
            }
        }
        
        // Use first non-empty value as last resort
        for (const val of values) {
            if (val && val.trim()) {
                return val;
            }
        }
        
        return `row_${values[0] || 'unknown'}`;
    }

    /**
     * Parse hierarchical files (soils.sol, plant.ini, management.sch, weather-wgn.cli)
     */
    private parseHierarchicalFile(filePath: string, table: SchemaTable, lines: string[], columnNames: string[], startLine: number, nullSet: Set<string>): {
        rows: IndexedRow[];
        fkRefs: FKReference[];
        fileTableMap: boolean;
    } {
        try {
            const fileName = path.basename(filePath);
            const rows: IndexedRow[] = [];
            const fkRefs: FKReference[] = [];
            const config = this.metadata?.hierarchical_files?.[fileName];

            if (!config || config === 'description') {
                // Not a recognized hierarchical file - try parsing as standard
                return { rows: [], fkRefs: [], fileTableMap: false };
            }

            if (fileName === 'plant.ini') {
                console.log(`[Indexer] ${fileName}: Starting hierarchical parse. columnNames.length=${columnNames.length}, startLine=${startLine}, totalLines=${lines.length}`);
                if (columnNames.length > 0) {
                    console.log(`[Indexer]   First 5 columns: ${columnNames.slice(0, 5).join(', ')}`);
                }
            }

            let lineNum = startLine;
            let recordCount = 0;
            
            while (lineNum < lines.length) {
                const line = lines[lineNum].trim();
                lineNum++;

                if (!line || line.startsWith('#')) {
                    continue;
                }

                const values = line.split(/\s+/);
                if (values.length === 0) {
                    continue;
                }

                if (fileName === 'plant.ini' && recordCount < 5) {
                    console.log(`[Indexer] ${fileName} record ${recordCount}: raw="${line.substring(0, 60)}" values.len=${values.length}`);
                }

                // Determine primary key from this line
                const valueMap: { [key: string]: string } = {};
                for (let i = 0; i < columnNames.length && i < values.length; i++) {
                    valueMap[columnNames[i]] = values[i];
                }

                if (fileName === 'plant.ini' && recordCount < 5) {
                    console.log(`[Indexer]   valueMap: ${Object.entries(valueMap).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(', ')}`);
                }

                let pkValue = '';
                for (const pkCol of table.primary_keys) {
                    if (valueMap[pkCol]) {
                        pkValue = valueMap[pkCol];
                        break;
                    }
                }
                if (!pkValue && valueMap['name']) {
                    pkValue = valueMap['name'];
                }
                if (!pkValue) {
                    pkValue = values[0] || `record_${recordCount}`;
                }

                let childLineCount = 0;

                // Determine number of child lines based on configuration
                if (config && typeof config === 'object') {
                    const structure = (config as any).structure || {};
                    let countField = structure.child_line_count_field;
                    const fixedCount = structure.child_line_count_fixed;

                    if (fixedCount && fixedCount > 0) {
                        childLineCount = Math.min(fixedCount, 1000);
                    } else if (countField) {
                        // Special case for plant.ini: field might be named plt_cnt instead of plnt_cnt
                        if (fileName === 'plant.ini' && countField === 'plnt_cnt' && !Object.keys(valueMap).find(k => k.toLowerCase() === 'plnt_cnt') && valueMap['plt_cnt']) {
                            countField = 'plt_cnt';
                            if (recordCount === 0) {
                                console.log(`[Indexer] ${fileName}: Adjusted countField from plnt_cnt to plt_cnt`);
                            }
                        }

                        if (countField.includes('+')) {
                            // Multiple fields (e.g., "numb_auto+numb_ops")
                            const fields = countField.split('+').map((f: string) => f.trim());
                            for (const field of fields) {
                                try {
                                    // Try exact match first, then case-insensitive
                                    let fieldVal = valueMap[field];
                                    if (!fieldVal) {
                                        const lowerField = field.toLowerCase();
                                        const matchingKey = Object.keys(valueMap).find(k => k.toLowerCase() === lowerField);
                                        if (matchingKey) {
                                            fieldVal = valueMap[matchingKey];
                                        }
                                    }
                                    childLineCount += Math.max(0, parseInt(fieldVal) || 0);
                                } catch (e) {
                                    // Ignore parse errors
                                }
                            }
                        } else {
                            // Single field
                            try {
                                // Try exact match first, then case-insensitive
                                let fieldVal = valueMap[countField];
                                if (!fieldVal) {
                                    const lowerField = countField.toLowerCase();
                                    const matchingKey = Object.keys(valueMap).find(k => k.toLowerCase() === lowerField);
                                    if (matchingKey) {
                                        fieldVal = valueMap[matchingKey];
                                    }
                                }
                                childLineCount = Math.max(0, parseInt(fieldVal) || 0);
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                        childLineCount = Math.min(Math.max(childLineCount, 0), 1000);
                    }
                }
                
                // Debug logging for child line detection
                if (childLineCount > 0 && recordCount === 0) {
                    const structure = (config as any).structure || {};
                    console.log(`[Indexer] ${fileName}: First record "${pkValue}" detected as hierarchical with ${childLineCount} child lines`);
                    console.log(`[Indexer]   countField="${structure.child_line_count_field}", fixedCount=${structure.child_line_count_fixed}`);
                    console.log(`[Indexer]   valueMap keys: ${Object.keys(valueMap).join(', ')}`);
                }

                if (fileName === 'plant.ini' && recordCount < 3) {
                    console.log(`[Indexer] ${fileName} record ${recordCount}: childLineCount=${childLineCount}`);
                }

                // Read child lines
                const primaryRowLineNum = lineNum - 1; // lineNum was already incremented
                
                if (childLineCount > 0 && recordCount < 2) {
                    console.log(`[Indexer] ${fileName}: Starting child row skip. lineNum=${lineNum}, childLineCount=${childLineCount}, linesLength=${lines.length}`);
                }

                // Skip child lines without storing them - hierarchical files only index main records
                for (let i = 0; i < childLineCount && lineNum < lines.length; i++) {
                    const childLine = lines[lineNum].trim();
                    
                    if (recordCount < 2) {
                        console.log(`[Indexer]   lineNum=${lineNum}: skipping child line (${childLine.substring(0, 40)}...)`);
                    }

                    // Only count non-empty, non-comment lines toward child line count
                    if (!childLine || childLine.startsWith('#')) {
                        i--; // Don't count this against the child line count
                    }
                    lineNum++;
                }

                if (childLineCount > 0 && recordCount < 2) {
                    console.log(`[Indexer] ${fileName}: Finished skipping child rows. Next lineNum=${lineNum}`);
                }

                const row: IndexedRow = {
                    file: filePath,
                    tableName: table.table_name,
                    lineNumber: primaryRowLineNum + 1,
                    pkValue,
                    pkValueLower: pkValue.toLowerCase(),
                    values: valueMap,
                    childRows: undefined
                };

                rows.push(row);
                recordCount++;

                // Extract FK references from main record
                for (const fk of table.foreign_keys) {
                    const fkValue = valueMap[fk.column];
                    if (fkValue && fkValue.trim() && !nullSet.has(fkValue.toLowerCase())) {
                        fkRefs.push({
                            sourceFile: filePath,
                            sourceTable: table.table_name,
                            sourceLine: primaryRowLineNum + 1,
                            sourceColumn: fk.column,
                            fkValue,
                            fkValueLower: fkValue.toLowerCase(),
                            targetTable: fk.references.table,
                            targetColumn: 'name',
                            resolved: false
                        });
                    }
                }
            }

            if (recordCount > 0) {
                console.log(`[Indexer] ${fileName} (hierarchical): parsed ${recordCount} records`);
            }
            
            return { rows, fkRefs, fileTableMap: true };
        } catch (error) {
            console.error(`[Indexer] parseHierarchicalFile error: ${error}`);
            return { rows: [], fkRefs: [], fileTableMap: false };
        }
    }

    /**
     * Parse decision table files (*.dtl)
     */
    private parseDecisionTableFile(filePath: string, table: SchemaTable, lines: string[]): {
        rows: IndexedRow[];
        fkRefs: FKReference[];
        fileTableMap: boolean;
    } {
        try {
            const rows: IndexedRow[] = [];
            const fkRefs: FKReference[] = [];

            // Simplified DTL parsing - read main table names
            let lineNum = 1; // Skip title line
            if (lineNum < lines.length) {
                try {
                    const numTables = parseInt(lines[lineNum].trim());
                    lineNum++;

                    for (let t = 0; t < numTables && lineNum < lines.length; t++) {
                        // Skip blank lines
                        while (lineNum < lines.length && !lines[lineNum].trim()) {
                            lineNum++;
                        }

                        if (lineNum >= lines.length) {
                            break;
                        }

                        const headerLine = lines[lineNum].trim();
                        const headerParts = headerLine.split(/\s+/);
                        
                        if (headerParts.length >= 4) {
                            const dtlName = headerParts[0];
                            const conds = headerParts[1];
                            const alts = headerParts[2];
                            const acts = headerParts[3];

                            const row: IndexedRow = {
                                file: filePath,
                                tableName: table.table_name,
                                lineNumber: lineNum + 1,
                                pkValue: dtlName,
                                pkValueLower: dtlName.toLowerCase(),
                                values: {
                                    name: dtlName,
                                    conds,
                                    alts,
                                    acts
                                }
                            };

                            rows.push(row);
                        }

                        lineNum++;
                    }
                } catch (e) {
                    // Silent fail for DTL parsing errors
                }
            }

            return { rows, fkRefs, fileTableMap: true };
        } catch (error) {
            console.error(`[Indexer] parseDecisionTableFile error: ${error}`);
            return { rows: [], fkRefs: [], fileTableMap: false };
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

        const schemaPath = this.resolveSchemaPath();
        const metadataPath = path.join(this.context.extensionPath, 'resources', 'schema', 'txtinout-metadata.json');
        const txtInOutPath = this.txtInOutPath ?? datasetPath;

        // Try a list of candidate Python executables so the extension works on Windows/macOS/Linux/WSL
        // Prefer the workspace virtualenv if present, then any env override, then platform defaults.
        const candidates: string[] = [];

        // Prefer a workspace-local virtual environment (common pattern: .venv)
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const ws = workspaceFolders[0].uri.fsPath;
                const venvUnix = path.join(ws, '.venv', 'bin', 'python');
                const venvWin = path.join(ws, '.venv', 'Scripts', 'python.exe');
                if (fs.existsSync(venvUnix)) {
                    candidates.push(venvUnix);
                }
                if (fs.existsSync(venvWin)) {
                    candidates.push(venvWin);
                }
            }
        } catch (err) {
            // Silence any workspace-folder resolution errors and fall back to env/platform candidates
        }

        // Honor explicit environment override from the user
        if (process.env.SWATPLUS_PYTHON) {
            candidates.push(process.env.SWATPLUS_PYTHON);
        }

        if (process.platform === 'win32') {
            candidates.push('py', 'python', 'python3');
        } else {
            // Linux, macOS, WSL - try python3 first then python
            candidates.push('python3', 'python');
        }

        const outputPath = path.join(os.tmpdir(), `swatplus-index-${Date.now()}.json`);
        const args = [
            scriptPath,
            '--dataset',
            txtInOutPath,
            '--schema',
            schemaPath,
            '--metadata',
            metadataPath,
            '--output',
            outputPath
        ];

        console.log(`[Indexer] Attempting pandas-backed indexing via candidates: ${candidates.join(', ')}`);

        let lastError: string | undefined;
        let result: import('child_process').SpawnSyncReturns<string> | null = null;

        for (const pythonExecutable of candidates) {
            try {
                console.log(`[Indexer] Trying python executable: ${pythonExecutable}`);
                // Increase maxBuffer to handle large JSON payloads emitted by the pandas indexer
                result = spawnSync(pythonExecutable, args, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
            } catch (err: any) {
                lastError = err.message || String(err);
                console.warn(`[Indexer] Failed to start ${pythonExecutable}: ${lastError}`);
                result = null;
            }

            if (!result) {
                continue;
            }

            if (result.error) {
                // If executable not found, try next candidate
                lastError = result.error.message;
                console.warn(`[Indexer] ${pythonExecutable} start error: ${lastError}`);
                continue;
            }

            if (result.status === 0) {
                // Success
                console.log(`[Indexer] pandas pipeline succeeded with ${pythonExecutable}`);
                break;
            } else {
                // Non-zero exit - capture stderr and try next candidate (in case of unexpected executable)
                lastError = result.stderr || `Exit code ${result.status}`;
                console.warn(`[Indexer] ${pythonExecutable} exited with code ${result.status}: ${lastError}`);
                // continue trying other candidates
            }
        }

        if (!result) {
            return { success: false, tableCount: 0, fkCount: 0, error: `Python not found: tried ${candidates.join(', ')}. Please install Python or set the SWATPLUS_PYTHON environment variable to the Python executable.` };
        }

        if (result.error) {
            return { success: false, tableCount: 0, fkCount: 0, error: `Python failed to start: ${result.error.message}` };
        }

        if (result.status !== 0) {
            const errorMsg = result.stderr || `Exit code ${result.status}, no stderr output`;
            return { success: false, tableCount: 0, fkCount: 0, error: `Indexer failed: ${errorMsg}` };
        }

        try {
            if (!fs.existsSync(outputPath)) {
                return { success: false, tableCount: 0, fkCount: 0, error: 'Indexer output file not found.' };
            }
            const payloadContent = fs.readFileSync(outputPath, 'utf-8');
            const payload = JSON.parse(payloadContent);

            this.index.clear();
            this.fkReferences = [];
            this.reverseIndex.clear();
            this.decisionTableIndex.clear();
            this.dynamicFileToTableMap.clear();

            if (payload.fileTableMap && typeof payload.fileTableMap === 'object') {
                for (const [fileName, tableName] of Object.entries(payload.fileTableMap)) {
                    if (typeof fileName === 'string' && typeof tableName === 'string') {
                        this.dynamicFileToTableMap.set(fileName.toLowerCase(), tableName);
                    }
                }
            }

            for (const [tableName, rows] of Object.entries(payload.tables || {})) {
                const tableIndex = new Map<string, IndexedRow>();
                const isDecisionTable = tableName.includes('dtl');
                (rows as IndexedRow[]).forEach((row) => {
                    const pkValueLower = row.pkValueLower ?? row.pkValue.toLowerCase();
                    tableIndex.set(pkValueLower, row);
                    if (isDecisionTable) {
                        this.decisionTableIndex.set(pkValueLower, row);
                    }
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
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[Indexer] Unable to parse pandas pipeline output: ${errorMsg}`);
            return { success: false, tableCount: 0, fkCount: 0, error: `Failed to parse indexer output: ${errorMsg}` };
        } finally {
            if (fs.existsSync(outputPath)) {
                try {
                    fs.unlinkSync(outputPath);
                } catch (error) {
                    console.warn(`[Indexer] Failed to remove temporary index output: ${error}`);
                }
            }
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

        if (!this.setDatasetPaths(datasetPath)) {
            return false;
        }

        // Clear existing index
        this.index.clear();
        this.fkReferences = [];
        this.reverseIndex.clear();
        this.decisionTableIndex.clear();

        // Show progress
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Building SWAT+ Inputs Index',
            cancellable: true
        }, async (progress, token) => {
            // Try TypeScript-based indexing first (no Python required)
            progress.report({ message: 'Indexing files...', increment: 10 });
            const tsDatasetPath = this.txtInOutPath || datasetPath;
            let indexResult = this.buildIndexWithTypeScript(tsDatasetPath);

            // Fall back to pandas if TypeScript indexer fails
            if (!indexResult.success) {
                console.log('[Indexer] TypeScript indexer failed, attempting pandas fallback...');
                const pandasDatasetPath = this.txtInOutPath || datasetPath;
                indexResult = this.buildIndexWithPandas(pandasDatasetPath);
            }

            if (!indexResult.success) {
                const errorDetail = indexResult.error || 'Unknown error';
                vscode.window.showErrorMessage(
                    `Failed to build index: ${errorDetail}. ` +
                    'Check the Output panel for details.'
                );
                return false;
            }

            // Parse file.cio after pandas indexing to add it to the index
            // file.cio has a special classification-based format handled separately
            progress.report({ message: 'Parsing file.cio...', increment: 70 });
            this.parseFileCio();

            progress.report({ message: 'Resolving foreign key references...', increment: 20 });
            this.resolveFKReferences();

            this.saveIndexCache(datasetPath);

            vscode.window.showInformationMessage(
                `Index built successfully: ${indexResult.tableCount} tables, ${this.fkReferences.length} FK references`
            );

            await this.context.workspaceState.update(`index:${datasetPath}`, {
                built: true,
                timestamp: new Date().toISOString(),
                tableCount: indexResult.tableCount,
                fkCount: this.fkReferences.length
            });

            return true;
        });
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
            const fkValueLower = fkRef.fkValueLower ?? fkRef.fkValue.toLowerCase();
            
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
                    targetRow = targetTableIndex.get(fkValueLower);
                }
            }
            
            if (targetRow) {
                fkRef.resolved = true;
                fkRef.targetRow = targetRow;
                resolvedCount++;
                
                // Build reverse index: target_table:pk_value -> FK references (case-insensitive)
                const reverseKey = `${actualTargetTable}:${fkValueLower}`;
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
     * Get the on-disk cache path for a dataset index.
     */
    public getIndexCachePath(datasetPath?: string): string | undefined {
        const resolvedPath = datasetPath ?? this.datasetPath;
        if (!resolvedPath) {
            return undefined;
        }
        return path.join(resolvedPath, this.indexCacheFileName);
    }

    /**
     * Check if a cached index exists on disk for the dataset.
     */
    public hasIndexCache(datasetPath: string): boolean {
        const cachePath = this.getIndexCachePath(datasetPath);
        return cachePath ? fs.existsSync(cachePath) : false;
    }

    /**
     * Load an index from a cached JSON file on disk.
     */
    public async loadIndexFromCache(datasetPath: string): Promise<boolean> {
        if (!this.schema) {
            vscode.window.showErrorMessage('Schema not loaded');
            return false;
        }

        if (!this.setDatasetPaths(datasetPath)) {
            return false;
        }

        const cachePath = this.getIndexCachePath(datasetPath);
        if (!cachePath || !fs.existsSync(cachePath)) {
            vscode.window.showWarningMessage('No cached index found for this dataset.');
            return false;
        }

        try {
            const payloadContent = fs.readFileSync(cachePath, 'utf-8');
            const payload = JSON.parse(payloadContent);

            this.index.clear();
            this.fkReferences = [];
            this.reverseIndex.clear();
            this.decisionTableIndex.clear();
            this.dynamicFileToTableMap.clear();
            this.fileCioData.clear();

            if (payload.fileTableMap && typeof payload.fileTableMap === 'object') {
                for (const [fileName, tableName] of Object.entries(payload.fileTableMap)) {
                    if (typeof fileName === 'string' && typeof tableName === 'string') {
                        this.dynamicFileToTableMap.set(fileName.toLowerCase(), tableName);
                    }
                }
            }

            for (const [tableName, rows] of Object.entries(payload.tables || {})) {
                const tableIndex = new Map<string, IndexedRow>();
                const isDecisionTable = tableName.includes('dtl');
                (rows as IndexedRow[]).forEach((row) => {
                    const pkValueLower = row.pkValueLower ?? row.pkValue.toLowerCase();
                    tableIndex.set(pkValueLower, row);
                    if (isDecisionTable) {
                        this.decisionTableIndex.set(pkValueLower, row);
                    }
                });
                this.index.set(tableName, tableIndex);
            }

            this.fkReferences = (payload.fkReferences || []) as FKReference[];

            if (payload.fileCioData && typeof payload.fileCioData === 'object') {
                for (const [classification, data] of Object.entries(payload.fileCioData)) {
                    const payloadData = data as { files?: string[]; isDefault?: boolean[] };
                    if (payloadData.files && payloadData.isDefault) {
                        this.fileCioData.set(classification.toLowerCase(), {
                            files: payloadData.files,
                            isDefault: payloadData.isDefault
                        });
                    }
                }
            } else {
                this.parseFileCio();
            }

            this.resolveFKReferences();

            await this.context.workspaceState.update(`index:${datasetPath}`, {
                built: true,
                timestamp: new Date().toISOString(),
                tableCount: this.index.size,
                fkCount: this.fkReferences.length
            });

            vscode.window.showInformationMessage(
                `Index loaded from cache: ${this.index.size} tables, ${this.fkReferences.length} FK references`
            );
            return true;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[Indexer] Failed to load cached index: ${errorMsg}`);
            vscode.window.showErrorMessage(`Failed to load cached index: ${errorMsg}`);
            return false;
        }
    }

    /**
     * Persist the current index to disk for reuse.
     */
    public saveIndexCache(datasetPath?: string): void {
        const cachePath = this.getIndexCachePath(datasetPath);
        if (!cachePath) {
            return;
        }

        try {
            const cachePayload: any = {
                version: 1,
                createdAt: new Date().toISOString(),
                tables: {},
                fkReferences: this.fkReferences,
                fileTableMap: Object.fromEntries(this.dynamicFileToTableMap),
                fileCioData: Object.fromEntries(this.fileCioData)
            };

            for (const [tableName, tableIndex] of this.index.entries()) {
                cachePayload.tables[tableName] = [];
                for (const row of tableIndex.values()) {
                    cachePayload.tables[tableName].push(row);
                }
            }

            fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), { encoding: 'utf-8' });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[Indexer] Failed to save cached index: ${errorMsg}`);
        }
    }

    /**
     * Get FK references for a specific file and line
     */
    public getFKReferencesForLine(filePath: string, lineNumber: number): FKReference[] {
        const normalizedPath = normalizePathForComparison(filePath);
        return this.fkReferences.filter(
            ref => normalizePathForComparison(ref.sourceFile) === normalizedPath && ref.sourceLine === lineNumber
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
        if (tableName.includes('dtl')) {
            const decisionRow = this.resolveDecisionTable(pkValue);
            if (decisionRow) {
                return decisionRow;
            }
        }

        const tableIndex = this.index.get(tableName);
        return tableIndex?.get(pkValue.toLowerCase());
    }

    /**
     * Look up a decision table across all indexed DTL files
     * Decision tables can be in any *.dtl file, so we search all DTL tables
     */
    public resolveDecisionTable(dtlName: string): IndexedRow | undefined {
        const lowerDtlName = dtlName.toLowerCase();
        return this.decisionTableIndex.get(lowerDtlName);
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
     * Get table name from file path
     * Returns the table name that corresponds to the given file path
     */
    public getTableNameFromFile(filePath: string): string | undefined {
        const fileName = path.basename(filePath).toLowerCase();
        return this.dynamicFileToTableMap.get(fileName) || this.fileToTableMap.get(fileName);
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
     * Get GitBook documentation URL for a file
     */
    public getGitbookUrl(fileName: string): string | null {
        if (!this.gitbookUrls) {
            return null;
        }
        
        return this.gitbookUrls.file_urls[fileName] || this.gitbookUrls.default_url;
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
     * Get the full indexed data for all tables
     * Returns a map of table name to table data
     */
    public getIndexData(): Map<string, Map<string, IndexedRow>> {
        return new Map(this.index);
    }

    /**
     * Get all FK references from a specific file
     */
    public getFKReferencesFromFile(filePath: string): FKReference[] {
        const normalizedPath = normalizePathForComparison(filePath);
        return this.fkReferences.filter(ref => normalizePathForComparison(ref.sourceFile) === normalizedPath);
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
     * Export the current index to a JSON file for inspection.
     * Returns the path to the written file or undefined on error.
     */
    public async exportIndexToFile(outPath?: string): Promise<string | undefined> {
        try {
            const exportObj: any = {
                tables: {},
                fkReferences: this.fkReferences,
                stats: this.getIndexStats()
            };

            for (const [tableName, tableIndex] of this.index.entries()) {
                exportObj.tables[tableName] = [];
                for (const row of tableIndex.values()) {
                    exportObj.tables[tableName].push(row);
                }
            }

            const targetPath = outPath || path.join(this.context.extensionPath, 'out', 'index_dump.json');
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            fs.writeFileSync(targetPath, JSON.stringify(exportObj, null, 2), { encoding: 'utf-8' });
            return targetPath;
        } catch (err) {
            console.error('Failed to export index to file', err);
            return undefined;
        }
    }

    /**
     * Get file references from file.cio by classification
     * Returns structured data with classification as key
     */
    public getFileCioData(): Map<string, { files: string[], isDefault: boolean[] }> {
        return new Map(this.fileCioData);
    }

    /**
     * Get file references for a specific classification
     */
    public getFileCioClassification(classification: string): { files: string[], isDefault: boolean[] } | undefined {
        return this.fileCioData.get(classification.toLowerCase());
    }

    /**
     * Check if a file is referenced in file.cio (in any classification)
     */
    public isFileReferencedInCio(filename: string): boolean {
        for (const data of this.fileCioData.values()) {
            const idx = data.files.indexOf(filename);
            if (idx !== -1 && !data.isDefault[idx]) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get all unique file references from file.cio
     * Returns a list of all non-null filenames across all classifications
     */
    public getAllFileCioReferences(): string[] {
        const files = new Set<string>();
        for (const data of this.fileCioData.values()) {
            data.files.forEach((file, idx) => {
                if (!data.isDefault[idx] && file.includes('.')) {
                    files.add(file);
                }
            });
        }
        return Array.from(files);
    }
}
