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

        // Try a list of candidate Python executables so the extension works on Windows/macOS/Linux
        const candidates: string[] = [];
        if (process.env.SWATPLUS_PYTHON) {
            candidates.push(process.env.SWATPLUS_PYTHON);
        }
        // Common names on various platforms
        candidates.push('python', 'python3', 'py');

        const args = [scriptPath, '--dataset', txtInOutPath, '--schema', schemaPath, '--metadata', metadataPath];

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
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[Indexer] Unable to parse pandas pipeline output: ${errorMsg}`);
            return { success: false, tableCount: 0, fkCount: 0, error: `Failed to parse indexer output: ${errorMsg}` };
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
