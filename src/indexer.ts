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
    private index: Map<string, Map<string, IndexedRow>> = new Map(); // table -> pk_value -> row
    private fkReferences: FKReference[] = [];
    private reverseIndex: Map<string, FKReference[]> = new Map(); // target_table:pk_value -> FK references
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
            
            // file.cio format:
            // Line 1: Title/description
            // Line 2+: filename entries (one per line)
            // Each line typically has: filename or classification filename
            
            // Look for the schema to understand the format
            const fileCioTable = this.schema?.tables['file.cio'];
            const dataStartLine = fileCioTable?.data_starts_after || 2;
            
            for (let i = dataStartLine; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('#')) {
                    continue;
                }
                
                // Parse the line - it may have multiple columns
                // The actual filename is typically in the 'file_name' column
                const parts = line.split(/\s+/);
                
                if (parts.length > 0) {
                    // The filename is typically the last or second-to-last part
                    // For simplicity, we'll extract what looks like a filename
                    for (const part of parts) {
                        // Check if it looks like a filename (has extension)
                        if (part.includes('.') && !part.startsWith('.')) {
                            const filename = part;
                            // Store with the filename as both key and value for now
                            // This allows us to track which files are actually referenced
                            this.fileCioReferences.set(filename, filename);
                            break;
                        }
                    }
                }
            }
            
            console.log(`Parsed file.cio: ${this.fileCioReferences.size} file references found`);
        } catch (error) {
            console.error(`Error parsing file.cio: ${error}`);
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
            
            // Sort tables to process file.cio first, then others
            const tables = Object.values(this.schema!.tables);
            const fileCioTable = tables.find(t => t.file_name === 'file.cio');
            const otherTables = tables.filter(t => t.file_name !== 'file.cio');
            
            // Process file.cio first if it exists
            const orderedTables = fileCioTable 
                ? [fileCioTable, ...otherTables]
                : tables;
            
            let processedCount = 0;

            for (const table of orderedTables) {
                if (token.isCancellationRequested) {
                    return false;
                }

                progress.report({
                    message: `Indexing ${table.file_name}...`,
                    increment: (100 / tables.length)
                });

                await this.indexTable(table);
                processedCount++;
            }

            // After indexing all tables, resolve FK references
            progress.report({ message: 'Resolving foreign key references...' });
            this.resolveFKReferences();

            vscode.window.showInformationMessage(
                `Index built successfully: ${processedCount} tables, ${this.fkReferences.length} FK references`
            );

            // Store index status
            await this.context.workspaceState.update(`index:${datasetPath}`, {
                built: true,
                timestamp: new Date().toISOString(),
                tableCount: processedCount,
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
            
            console.log(`[Indexer] Indexing ${table.table_name} (${path.basename(filePath)}), data starts at line ${dataStartLine}, headers: ${headers.join(', ')}`);

            for (let i = dataStartLine; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) {continue;}

                const values = line.split(/\s+/).map(v => v.trim()); // Trim each value
                if (values.length < headers.length) {
                    console.warn(`Malformed line ${i + 1} in ${filePath}`);
                    continue;
                }

                // Build value map
                const valueMap: { [key: string]: string } = {};
                for (let j = 0; j < headers.length && j < values.length; j++) {
                    valueMap[headers[j]] = values[j];
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

                tableIndex.set(pkValue, row);

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
            const targetTableIndex = this.index.get(fkRef.targetTable);
            if (targetTableIndex) {
                const targetRow = targetTableIndex.get(fkRef.fkValue);
                if (targetRow) {
                    fkRef.resolved = true;
                    fkRef.targetRow = targetRow;
                    resolvedCount++;
                    
                    // Build reverse index: target_table:pk_value -> FK references
                    const reverseKey = `${fkRef.targetTable}:${fkRef.fkValue}`;
                    if (!this.reverseIndex.has(reverseKey)) {
                        this.reverseIndex.set(reverseKey, []);
                    }
                    this.reverseIndex.get(reverseKey)!.push(fkRef);
                } else {
                    unresolvedCount++;
                    // Log first few unresolved for debugging
                    if (unresolvedCount <= 10) {
                        const indexedKeys = Array.from(targetTableIndex.keys()).slice(0, 10);
                        console.log(`[Indexer]   Unresolved FK: ${fkRef.sourceColumn}="${fkRef.fkValue}" (length=${fkRef.fkValue.length}) -> ${fkRef.targetTable}`);
                        console.log(`[Indexer]     Indexed keys (first 10): ${indexedKeys.map(k => `"${k}" (len=${k.length})`).join(', ')}`);
                        console.log(`[Indexer]     FK value bytes: [${Array.from(fkRef.fkValue).map(c => c.charCodeAt(0)).join(', ')}]`);
                        if (indexedKeys.length > 0) {
                            console.log(`[Indexer]     First key bytes: [${Array.from(indexedKeys[0]).map(c => c.charCodeAt(0)).join(', ')}]`);
                        }
                    }
                }
            } else {
                unresolvedCount++;
                // Log missing target table
                if (unresolvedCount <= 5) {
                    console.log(`[Indexer]   Unresolved FK (table not indexed): ${fkRef.sourceColumn}="${fkRef.fkValue}" -> ${fkRef.targetTable}`);
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
        return tableIndex?.get(pkValue);
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
        const reverseKey = `${tableName}:${pkValue}`;
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
