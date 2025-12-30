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

// Constants for FK filtering
const FK_NULL_VALUES = ['null', '0', ''];

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
    private index: Map<string, Map<string, IndexedRow>> = new Map(); // table -> pk_value -> row
    private fkReferences: FKReference[] = [];
    private datasetPath: string | null = null;
    private txtInOutPath: string | null = null;

    constructor(private context: vscode.ExtensionContext) {
        this.loadSchema();
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
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load SWAT+ schema: ${error}`);
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
        this.txtInOutPath = path.join(datasetPath, 'TxtInOut');

        // Check if TxtInOut directory exists
        if (!fs.existsSync(this.txtInOutPath)) {
            vscode.window.showErrorMessage(
                `TxtInOut directory not found in ${datasetPath}. ` +
                'Please ensure this is a valid SWAT+ dataset folder.'
            );
            return false;
        }

        // Clear existing index
        this.index.clear();
        this.fkReferences = [];

        // Show progress
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Building SWAT+ Inputs Index',
            cancellable: true
        }, async (progress, token) => {
            const tables = Object.values(this.schema!.tables);
            let processedCount = 0;

            for (const table of tables) {
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

            for (let i = dataStartLine; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) {continue;}

                const values = line.split(/\s+/);
                if (values.length < headers.length) {
                    console.warn(`Malformed line ${i + 1} in ${filePath}`);
                    continue;
                }

                // Build value map
                const valueMap: { [key: string]: string } = {};
                for (let j = 0; j < headers.length && j < values.length; j++) {
                    valueMap[headers[j]] = values[j];
                }

                // Get primary key value (assume 'id' or 'name')
                const pkColumn = table.primary_keys[0] || 'id';
                const pkValue = valueMap[pkColumn] || '';

                const row: IndexedRow = {
                    file: filePath,
                    tableName: table.table_name,
                    lineNumber: i + 1,  // 1-based
                    pkValue,
                    values: valueMap
                };

                tableIndex.set(pkValue, row);

                // Record FK references
                for (const fk of table.foreign_keys) {
                    const fkValue = valueMap[fk.column];
                    if (fkValue && !FK_NULL_VALUES.includes(fkValue)) {
                        this.fkReferences.push({
                            sourceFile: filePath,
                            sourceTable: table.table_name,
                            sourceLine: i + 1,
                            sourceColumn: fk.column,
                            fkValue,
                            targetTable: fk.references.table,
                            targetColumn: fk.references.column,
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
     * Resolve FK references by looking up target rows
     */
    private resolveFKReferences(): void {
        for (const fkRef of this.fkReferences) {
            const targetTableIndex = this.index.get(fkRef.targetTable);
            if (targetTableIndex) {
                const targetRow = targetTableIndex.get(fkRef.fkValue);
                if (targetRow) {
                    fkRef.resolved = true;
                    fkRef.targetRow = targetRow;
                }
            }
        }
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
     * Check if index is built
     */
    public isIndexBuilt(): boolean {
        return this.index.size > 0;
    }

    /**
     * Get current dataset path
     */
    public getDatasetPath(): string | null {
        return this.datasetPath;
    }
}
