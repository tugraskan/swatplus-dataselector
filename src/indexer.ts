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
import { spawn, spawnSync } from 'child_process';
import * as os from 'os';
import { normalizePathForComparison, resolveFileCioPath } from './pathUtils';
import { getPhysicalColumnsForValidation, isAcceptedBooleanLiteral, resolveValidationLayout, formatColumnContext, isMissingRequiredValue } from './fileFormatUtils';
import { getSharedEnrichedSchema } from './enrichedSchema';
import { CURRENT_INDEX_CACHE_VERSION, isIndexCacheCompatible } from './indexCacheUtils';
import { isFileChangedSince, MAX_TRACKED_STALE_FILES, shouldMarkStale } from './indexStalenessUtils';

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

export interface IndexingPrerequisiteStatus {
    ready: boolean;
    message: string;
    missingModules: string[];
    pythonExecutable?: string;
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

export interface FilePointerIssue {
    sourceFile: string;      // absolute path to the source file containing the reference
    sourceLine: number;      // 1-based line number in the source file
    sourceTable: string;     // table name in the index
    sourceColumn: string;    // column name that contains the file pointer
    referencedFile: string;  // the file name/path that was referenced but does not exist
    columnDescription?: string; // human-readable description of the pointer column
}

export interface MissingForeignKeyFileIssue {
    sourceFile: string;      // absolute path to the source file containing the reference
    sourceLine: number;      // 1-based line number in the source file
    sourceTable: string;     // table name containing the FK value
    sourceColumn: string;    // FK column in the source file
    fkValue: string;         // unresolved FK value
    targetTable: string;     // target table name from schema
    targetColumn: string;    // target column name from schema
    targetFile: string;      // target file expected in the dataset
}

/**
 * Categories of file format issues that can be detected by the format checker.
 */
export type FileFormatIssueKind =
    | 'empty_file'           // The file exists but contains no content
    | 'missing_metadata_line'// Schema expects a title/metadata line but it is absent or blank
    | 'missing_header_line'  // Schema expects a column-header line but it is absent or blank
    | 'header_column_mismatch' // Actual header columns differ substantially from schema columns
    | 'wrong_column_count'   // A data row has fewer columns than the schema defines
    | 'invalid_integer'      // An IntegerField column contains a non-integer value
    | 'invalid_decimal'      // A DoubleField column contains a non-numeric value
    | 'invalid_boolean'      // A BooleanField column contains an invalid boolean literal
    | 'missing_required_value'; // A required (non-nullable) column is empty or 'null'

/**
 * A single format issue detected in a SWAT+ input file.
 */
export interface FileFormatIssue {
    file: string;            // absolute path to the source file
    line: number;            // 1-based line number (0 = file-level issue, not tied to a specific line)
    column?: string;         // schema column name involved (if applicable)
    kind: FileFormatIssueKind;
    message: string;
    expected?: string;       // what was expected (e.g. column name, data type)
    actual?: string;         // what was actually found
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
    private outputTableNames: Set<string> = new Set(); // schema tables that describe generated outputs
    private dynamicFileToTableMap: Map<string, string> = new Map(); // runtime file_name -> table_name
    private fkNullValues: string[] = ['null', '0', '']; // Default, can be overridden by metadata
    // file.cio data indexed by classification
    // Structure: classification -> { files: string[], isDefault: boolean[] }
    private fileCioData: Map<string, { files: string[], isDefault: boolean[] }> = new Map();
    private decisionTableIndex: Map<string, IndexedRow> = new Map(); // dtl name (lowercase) -> row
    private readonly indexCacheFileName = 'index.json';
    private schemaPathOverride: string | null = null;
    private fileCioHeader: FileCioHeaderInfo | null = null;
    private readonly requiredPythonModules: string[] = ['pandas'];
    private readonly pythonPrereqCacheTtlMs = 10000;
    private pythonPrereqCache?: { checkedAt: number; status: IndexingPrerequisiteStatus };
    private readonly outputChannel: vscode.OutputChannel;
    private indexStale = false;
    private staleFiles: Set<string> = new Set();
    private indexBuildInProgress = false;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('SWAT+ Indexer');
        this.context.subscriptions.push(this.outputChannel);
        const storedSchemaPath = this.context.workspaceState.get<string>('swatplus.schemaPath');
        this.schemaPathOverride = storedSchemaPath || null;
        this.loadSchema();
        this.loadMetadata();
        this.loadGitbookUrls();
    }

    /** Append a timestamped line to the SWAT+ Indexer output channel. */
    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    /** Reveal the indexer output channel (used by error notifications' "Show Details" action). */
    public showOutput(): void {
        this.outputChannel.show(true);
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

            this.tableToFileMap.clear();
            this.fileToTableMap.clear();
            this.outputTableNames.clear();
            
            // Build table name to file name mapping
            if (this.schema) {
                for (const [fileName, tableInfo] of Object.entries(this.schema.tables)) {
                    this.tableToFileMap.set(tableInfo.table_name, fileName);
                    this.fileToTableMap.set(fileName.toLowerCase(), tableInfo.table_name);
                    if (tableInfo.model_class?.startsWith('output.')) {
                        this.outputTableNames.add(tableInfo.table_name);
                    }
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

    private getPythonCandidates(): string[] {
        const candidates: string[] = [];

        if (process.env.SWATPLUS_PYTHON) {
            candidates.push(process.env.SWATPLUS_PYTHON);
        }

        if (process.platform === 'win32') {
            candidates.push('py', 'python', 'python3');
        } else {
            candidates.push('python3', 'python');
        }

        return Array.from(new Set(candidates));
    }

    private extractMissingModules(text: string): string[] {
        const matches = text.matchAll(/No module named ['"]([^'"]+)['"]/g);
        const modules = new Set<string>();
        for (const match of matches) {
            if (match[1]) {
                modules.add(match[1]);
            }
        }
        return Array.from(modules);
    }

    public getIndexingPrerequisiteStatus(forceRefresh = false): IndexingPrerequisiteStatus {
        const now = Date.now();
        if (!forceRefresh && this.pythonPrereqCache && (now - this.pythonPrereqCache.checkedAt) < this.pythonPrereqCacheTtlMs) {
            return this.pythonPrereqCache.status;
        }

        const scriptPath = path.join(this.context.extensionPath, 'scripts', 'pandas_indexer.py');
        if (!fs.existsSync(scriptPath)) {
            const status: IndexingPrerequisiteStatus = {
                ready: false,
                message: 'Indexer script not found (scripts/pandas_indexer.py).',
                missingModules: [],
            };
            this.pythonPrereqCache = { checkedAt: now, status };
            return status;
        }

        const candidates = this.getPythonCandidates();
        const missingModules = new Set<string>();
        let pythonFound = false;
        let lastError = '';

        const importStmt = this.requiredPythonModules.map(moduleName => `import ${moduleName}`).join('; ');
        const checkArgs = ['-c', importStmt];

        for (const pythonExecutable of candidates) {
            let result: import('child_process').SpawnSyncReturns<string>;
            try {
                result = spawnSync(pythonExecutable, checkArgs, { encoding: 'utf-8', timeout: 4000 });
            } catch (error: any) {
                lastError = error?.message || String(error);
                continue;
            }

            if (result.error) {
                if ((result.error as any).code !== 'ENOENT') {
                    lastError = result.error.message;
                }
                continue;
            }

            pythonFound = true;

            if (result.status === 0) {
                const status: IndexingPrerequisiteStatus = {
                    ready: true,
                    message: 'Python and required indexing modules are available.',
                    missingModules: [],
                    pythonExecutable
                };
                this.pythonPrereqCache = { checkedAt: now, status };
                return status;
            }

            const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
            this.extractMissingModules(output).forEach(moduleName => missingModules.add(moduleName));
            lastError = output || `${pythonExecutable} exited with code ${result.status}`;
        }

        const missingModuleList = Array.from(missingModules);
        let message: string;

        if (!pythonFound) {
            message = 'Python was not found. Install Python and required modules to enable indexing.';
        } else if (missingModuleList.length > 0) {
            message = `Python is available but missing required module(s): ${missingModuleList.join(', ')}. Install with: pip install -r scripts/requirements.txt`;
        } else {
            message = `Python dependency check failed${lastError ? `: ${lastError}` : '.'}`;
        }

        const status: IndexingPrerequisiteStatus = {
            ready: false,
            message,
            missingModules: missingModuleList,
        };

        this.pythonPrereqCache = { checkedAt: now, status };
        return status;
    }

    /**
     * Run the Python indexer as a detached async process.
     *
     * `spawn` (rather than `spawnSync`) keeps the extension host responsive while the
     * indexer runs, which can take a while on large datasets. The cancellation token is
     * wired to the child process so the progress notification's Cancel button actually
     * stops the work instead of only dismissing the notification.
     */
    private runPythonIndexer(
        pythonExecutable: string,
        args: string[],
        token?: vscode.CancellationToken
    ): Promise<{ status: number | null; stdout: string; stderr: string; startError?: Error; cancelled: boolean }> {
        return new Promise(resolve => {
            let stdout = '';
            let stderr = '';
            let cancelled = false;
            let settled = false;

            let child: import('child_process').ChildProcessWithoutNullStreams;
            try {
                child = spawn(pythonExecutable, args, { windowsHide: true });
            } catch (err) {
                resolve({
                    status: null,
                    stdout: '',
                    stderr: '',
                    startError: err instanceof Error ? err : new Error(String(err)),
                    cancelled: false
                });
                return;
            }

            const cancelSubscription = token?.onCancellationRequested(() => {
                cancelled = true;
                // SIGTERM lets Python unwind; the process is killed outright if it ignores it.
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!settled && !child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 2000).unref?.();
            });

            const settle = (result: { status: number | null; stdout: string; stderr: string; startError?: Error }) => {
                if (settled) {
                    return;
                }
                settled = true;
                cancelSubscription?.dispose();
                resolve({ ...result, cancelled });
            };

            child.stdout.setEncoding('utf-8');
            child.stderr.setEncoding('utf-8');
            child.stdout.on('data', chunk => { stdout += chunk; });
            child.stderr.on('data', chunk => { stderr += chunk; });

            child.on('error', err => {
                settle({ status: null, stdout, stderr, startError: err });
            });

            child.on('close', code => {
                settle({ status: code, stdout, stderr });
            });
        });
    }

    /**
     * Build the index using the pandas helper script for tabular processing
     */
    private async buildIndexWithPandas(
        datasetPath: string,
        token?: vscode.CancellationToken
    ): Promise<{ success: boolean; tableCount: number; fkCount: number; error?: string; cancelled?: boolean }> {
        const scriptPath = path.join(this.context.extensionPath, 'scripts', 'pandas_indexer.py');
        if (!fs.existsSync(scriptPath)) {
            console.log('[Indexer] pandas_indexer.py not found, skipping pandas pipeline');
            return { success: false, tableCount: 0, fkCount: 0, error: 'Indexer script not found' };
        }

        const schemaPath = this.resolveSchemaPath();
        const metadataPath = path.join(this.context.extensionPath, 'resources', 'schema', 'txtinout-metadata.json');
        const txtInOutPath = this.txtInOutPath ?? datasetPath;

        // Try a list of candidate Python executables so the extension works on Windows/macOS/Linux/WSL.
        const candidates = this.getPythonCandidates();

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
        let result: Awaited<ReturnType<typeof this.runPythonIndexer>> | null = null;

        for (const pythonExecutable of candidates) {
            if (token?.isCancellationRequested) {
                return { success: false, tableCount: 0, fkCount: 0, cancelled: true, error: 'Index build cancelled.' };
            }

            console.log(`[Indexer] Trying python executable: ${pythonExecutable}`);
            const attempt = await this.runPythonIndexer(pythonExecutable, args, token);

            if (attempt.cancelled) {
                return { success: false, tableCount: 0, fkCount: 0, cancelled: true, error: 'Index build cancelled.' };
            }

            if (attempt.startError) {
                // If executable not found, try next candidate
                lastError = attempt.startError.message;
                console.warn(`[Indexer] ${pythonExecutable} start error: ${lastError}`);
                continue;
            }

            result = attempt;

            if (attempt.status === 0) {
                // Success
                console.log(`[Indexer] pandas pipeline succeeded with ${pythonExecutable}`);
                break;
            }

            // Non-zero exit - capture stderr and try next candidate (in case of unexpected executable)
            lastError = attempt.stderr || `Exit code ${attempt.status}`;
            console.warn(`[Indexer] ${pythonExecutable} exited with code ${attempt.status}: ${lastError}`);
            this.log(`${pythonExecutable} exited with code ${attempt.status}:\n${lastError}`);
            // continue trying other candidates
        }

        if (!result) {
            return { success: false, tableCount: 0, fkCount: 0, error: `Python not found: tried ${candidates.join(', ')}. Please install Python or set the SWATPLUS_PYTHON environment variable to the Python executable. Last error: ${lastError ?? 'none'}` };
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
        if (this.indexBuildInProgress) {
            vscode.window.showInformationMessage(
                'A SWAT+ index build is already running. Wait for it to finish or cancel it before starting another.'
            );
            return false;
        }

        this.indexBuildInProgress = true;
        try {
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
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Building SWAT+ Inputs Index',
                cancellable: true
            }, async (progress, token) => {
                this.log(`Building index for ${datasetPath}`);

                // Use pandas-backed indexing (required)
                progress.report({ message: 'Reading input files…', increment: 10 });
                const pandasDatasetPath = this.txtInOutPath || datasetPath;
                const pandasResult = await this.buildIndexWithPandas(pandasDatasetPath, token);

                if (pandasResult.cancelled || token.isCancellationRequested) {
                    this.log('Index build cancelled by user.');
                    vscode.window.showInformationMessage('SWAT+ index build cancelled.');
                    return false;
                }

                if (!pandasResult.success) {
                    const errorDetail = pandasResult.error || 'Unknown error';
                    this.log(`Index build failed: ${errorDetail}`);
                    void vscode.window
                        .showErrorMessage(`Failed to build index: ${errorDetail}`, 'Show Details')
                        .then(choice => {
                            if (choice === 'Show Details') {
                                this.showOutput();
                            }
                        });
                    return false;
                }

                // Parse file.cio after pandas indexing to add it to the index
                // file.cio has a special classification-based format handled separately
                progress.report({ message: 'Parsing file.cio…', increment: 60 });
                this.parseFileCio();

                progress.report({ message: 'Resolving foreign key references…', increment: 25 });
                this.resolveFKReferences();

                progress.report({ message: 'Saving index cache…', increment: 5 });
                this.saveIndexCache(datasetPath);
                this.clearIndexStale();

                const unresolvedCount = this.fkReferences.filter(ref => !ref.resolved).length;
                this.log(
                    `Index built: ${pandasResult.tableCount} tables, ${this.fkReferences.length} FK references, ` +
                    `${unresolvedCount} unresolved.`
                );

                // The success notification is raised by the caller so it can carry a
                // follow-up action, rather than stacking two toasts for one build.
                await this.context.workspaceState.update(`index:${datasetPath}`, {
                    built: true,
                    timestamp: new Date().toISOString(),
                    tableCount: pandasResult.tableCount,
                    fkCount: this.fkReferences.length
                });

                return true;
            });
        } finally {
            this.indexBuildInProgress = false;
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

    /** True while the external indexer owns the mutable in-memory index state. */
    public isBuildInProgress(): boolean {
        return this.indexBuildInProgress;
    }

    /**
     * Drop the active in-memory index when the UI switches to a dataset without a
     * cache. Persisted caches are not removed.
     */
    public clearActiveIndex(): void {
        if (this.indexBuildInProgress) {
            return;
        }
        this.index.clear();
        this.fkReferences = [];
        this.reverseIndex.clear();
        this.decisionTableIndex.clear();
        this.dynamicFileToTableMap.clear();
        this.fileCioData.clear();
        this.datasetPath = null;
        this.txtInOutPath = null;
        this.clearIndexStale();
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
    public async loadIndexFromCache(
        datasetPath: string,
        options?: { notifyIfIncompatible?: boolean }
    ): Promise<boolean> {
        if (this.indexBuildInProgress) {
            if (options?.notifyIfIncompatible ?? true) {
                vscode.window.showInformationMessage(
                    'An index build is already running. Wait for it to finish or cancel it before loading another cache.'
                );
            }
            return false;
        }

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
            const notifyIfIncompatible = options?.notifyIfIncompatible ?? true;

            if (!isIndexCacheCompatible(payload.version)) {
                if (notifyIfIncompatible) {
                    vscode.window.showWarningMessage(
                        'Cached index is out of date for this extension version. Rebuild the index to refresh diagnostics.'
                    );
                }
                return false;
            }

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

            const payloadCreatedAt = typeof payload.createdAt === 'string'
                && !Number.isNaN(Date.parse(payload.createdAt))
                ? payload.createdAt
                : fs.statSync(cachePath).mtime.toISOString();
            this.restoreStalenessFromCache(payloadCreatedAt);

            await this.context.workspaceState.update(`index:${datasetPath}`, {
                built: true,
                timestamp: payloadCreatedAt,
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
     * Reconstruct the stale marker after loading a cache. File watcher events only
     * cover the current extension session, so inputs changed while VS Code was closed
     * must be detected from their modification times.
     */
    private restoreStalenessFromCache(cacheCreatedAt: string): void {
        this.clearIndexStale();
        const cacheTime = Date.parse(cacheCreatedAt);
        if (Number.isNaN(cacheTime)) {
            this.indexStale = true;
            return;
        }

        const indexedInputFiles = new Set<string>();
        for (const [tableName, rows] of this.index.entries()) {
            if (this.outputTableNames.has(tableName)) {
                continue;
            }
            for (const row of rows.values()) {
                if (row.file) {
                    indexedInputFiles.add(row.file);
                }
            }
        }

        for (const filePath of indexedInputFiles) {
            let changed = false;
            try {
                const modifiedAt = fs.existsSync(filePath)
                    ? fs.statSync(filePath).mtimeMs
                    : undefined;
                changed = isFileChangedSince(cacheCreatedAt, modifiedAt);
            } catch {
                changed = true;
            }
            if (!changed) {
                continue;
            }
            this.indexStale = true;
            if (this.staleFiles.size < MAX_TRACKED_STALE_FILES) {
                this.staleFiles.add(path.basename(filePath));
            }
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
                version: CURRENT_INDEX_CACHE_VERSION,
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
     * Get FK references that point at a given (target table, pk value).
     * Case-insensitive on the pk value, mirroring the reverse index.
     */
    public getIncomingFKReferences(targetTable: string, pkValue: string): FKReference[] {
        const reverseKey = `${targetTable}:${pkValue.toLowerCase()}`;
        return this.reverseIndex.get(reverseKey) ?? [];
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

    /** True only when the in-memory index belongs to the requested dataset. */
    public isIndexBuiltForDataset(datasetPath: string | undefined): boolean {
        if (!datasetPath || !this.datasetPath || !this.isIndexBuilt()) {
            return false;
        }
        return normalizePathForComparison(datasetPath)
            === normalizePathForComparison(this.datasetPath);
    }

    /** ISO timestamp of the last successful build/load for a dataset, if any. */
    public getIndexBuiltAt(datasetPath: string): string | undefined {
        const state = this.context.workspaceState.get<{ timestamp?: string }>(`index:${datasetPath}`);
        return state?.timestamp;
    }

    /** Headline counts for the current index, used for build notifications. */
    public getIndexSummary(): { tableCount: number; fkCount: number; unresolvedCount: number } {
        return {
            tableCount: this.index.size,
            fkCount: this.fkReferences.length,
            unresolvedCount: this.fkReferences.filter(ref => !ref.resolved).length
        };
    }

    /**
     * True when input files changed on disk after the index was built, so FK
     * navigation and diagnostics may no longer match what is in the editor.
     */
    public isIndexStale(): boolean {
        return this.indexStale && this.isIndexBuilt();
    }

    /** Names of the files that changed since the index was built (capped for display). */
    public getStaleFiles(): string[] {
        return Array.from(this.staleFiles);
    }

    /**
     * Record that an indexed input file changed on disk. Called by the dataset file
     * watcher; the sidebar surfaces this as a "rebuild the index" prompt rather than
     * letting navigation silently drift out of sync with the files.
     */
    public markIndexStale(changedFile?: string): void {
        if (!changedFile) {
            if (this.isIndexBuilt()) {
                this.indexStale = true;
            }
            return;
        }

        const stale = shouldMarkStale(changedFile, {
            indexBuilt: this.isIndexBuilt(),
            isIndexedFile: filePath => {
                const tableName = this.getTableNameFromFile(filePath);
                return Boolean(tableName && this.index.has(tableName));
            },
            isOutputFile: filePath => {
                const tableName = this.getTableNameFromFile(filePath);
                return Boolean(tableName && this.outputTableNames.has(tableName));
            }
        });
        if (!stale) {
            return;
        }

        this.indexStale = true;
        // Cap the set so a bulk rewrite cannot grow it without bound.
        if (this.staleFiles.size < MAX_TRACKED_STALE_FILES) {
            this.staleFiles.add(path.basename(changedFile));
        }
    }

    /** Clear the stale marker after a successful build or cache load. */
    public clearIndexStale(): void {
        this.indexStale = false;
        this.staleFiles.clear();
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

    /**
     * Return unresolved FK references whose target table file is missing from the
     * current dataset index.
     */
    public getMissingForeignKeyFileIssues(): MissingForeignKeyFileIssue[] {
        const issues: MissingForeignKeyFileIssue[] = [];

        for (const ref of this.fkReferences) {
            if (ref.resolved || this.isTableIndexed(ref.targetTable)) {
                continue;
            }

            issues.push({
                sourceFile: ref.sourceFile,
                sourceLine: ref.sourceLine,
                sourceTable: ref.sourceTable,
                sourceColumn: ref.sourceColumn,
                fkValue: ref.fkValue,
                targetTable: ref.targetTable,
                targetColumn: ref.targetColumn,
                targetFile: this.getFileNameForTable(ref.targetTable) || ref.targetTable
            });
        }

        return issues;
    }

    /**
     * Check all file pointer columns across indexed tables and return issues where
     * the referenced file does not exist on disk.
     *
     * File pointer columns are defined in the metadata's `file_pointer_columns` map.
     * Each entry maps a source file name to an object whose keys (excluding the
     * special "description" key) are column names that contain file name references.
     */
    public getFilePointerIssues(): FilePointerIssue[] {
        if (!this.metadata?.file_pointer_columns || !this.txtInOutPath) {
            return [];
        }

        const issues: FilePointerIssue[] = [];
        const nullSet = new Set(this.fkNullValues.map(v => v.toLowerCase()));
        const filePointerColumns = this.metadata.file_pointer_columns;

        for (const [fileName, columnDefs] of Object.entries(filePointerColumns)) {
            // Skip the top-level "description" key (metadata, not a file entry)
            if (fileName === 'description' || typeof columnDefs !== 'object' || Array.isArray(columnDefs)) {
                continue;
            }

            // Find the indexed table name for this file
            const tableName = this.fileToTableMap.get(fileName.toLowerCase()) ||
                this.dynamicFileToTableMap.get(fileName.toLowerCase());
            if (!tableName) {
                continue;
            }

            const tableIndex = this.index.get(tableName);
            if (!tableIndex) {
                continue;
            }

            // Collect the pointer column names, skipping the per-file "description" key
            const pointerColumns = Object.keys(columnDefs as object).filter(k => k !== 'description');

            for (const row of tableIndex.values()) {
                for (const colName of pointerColumns) {
                    const value = row.values[colName];

                    // Skip null/empty/sentinel values
                    if (!value || !value.trim() || nullSet.has(value.toLowerCase())) {
                        continue;
                    }

                    // Determine whether this column is a file pointer:
                    // - columns with a 'file_pattern' definition are always file references
                    // - for other columns, only check values that look like file names (contain a period),
                    //   which avoids false positives for name-reference columns (e.g. wgn station name)
                    const colDef = (columnDefs as Record<string, unknown>)[colName];
                    const hasFilePattern = typeof colDef === 'object' && colDef !== null &&
                        'file_pattern' in (colDef as object);
                    if (!hasFilePattern && !value.includes('.')) {
                        continue;
                    }

                    // Check whether the referenced file exists in the TxtInOut directory
                    const targetFilePath = path.join(this.txtInOutPath!, value);
                    if (!fs.existsSync(targetFilePath)) {
                        const description = typeof colDef === 'object' && colDef !== null
                            ? (colDef as { description?: string }).description
                            : (typeof colDef === 'string' ? colDef : undefined);

                        issues.push({
                            sourceFile: row.file,
                            sourceLine: row.lineNumber,
                            sourceTable: tableName,
                            sourceColumn: colName,
                            referencedFile: value,
                            columnDescription: description
                        });
                    }
                }
            }
        }

        return issues;
    }

    /**
     * Check all schema-defined files in the dataset for format issues:
     *   - Empty files
     *   - Missing title (metadata) line
     *   - Missing or mismatched column-header line
     *   - Data rows with too few columns
     *   - Data rows with invalid values for typed columns (integer, decimal, boolean)
     *
     * Hierarchical files (soils.sol, plant.ini, …) and decision-table files (*.dtl)
     * are skipped for deep row-level checks because their non-tabular format
     * requires special parsing beyond what this generic validator can handle.
     * Basic empty-file and header checks are still performed for all files.
     *
     * At most MAX_ISSUES_PER_FILE row-level issues are collected per file to
     * keep the results readable.
     */
    public getFileFormatIssues(): FileFormatIssue[] {
        if (!this.schema || !this.txtInOutPath) {
            return [];
        }

        const MAX_ISSUES_PER_FILE = 20;
        const nullSet = new Set(this.fkNullValues.map(v => v.toLowerCase()));
        const hierarchicalFileNames = new Set(
            Object.keys(this.metadata?.hierarchical_files ?? {}).filter(k => k !== 'description')
        );

        const issues: FileFormatIssue[] = [];

        for (const table of Object.values(this.schema.tables)) {
            const fileName = table.file_name;
            const filePath = path.join(this.txtInOutPath, fileName);

            if (!fs.existsSync(filePath)) {
                continue; // missing-file issues are handled by the file-pointer checker
            }

            let content: string;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch {
                continue;
            }

            // Normalise line endings
            const rawLines = content.split(/\r?\n/);

            // ── 1. Empty file ──────────────────────────────────────────────────
            const nonEmpty = rawLines.filter(l => l.trim().length > 0);
            if (nonEmpty.length === 0) {
                issues.push({
                    file: filePath,
                    line: 0,
                    kind: 'empty_file',
                    message: `File is empty: ${fileName}`
                });
                continue; // nothing else to check
            }

            const physicalColumns = getPhysicalColumnsForValidation(table, this.metadata);
            const isHierarchical = hierarchicalFileNames.has(fileName);
            const isDtl = fileName.toLowerCase().endsWith('.dtl');
            const validationLayout = resolveValidationLayout(
                rawLines,
                table,
                physicalColumns,
                this.fkNullValues
            );

            // ── 2. Metadata (title) line ────────────────────────────────────────
            if (table.has_metadata_line) {
                const metaLine = rawLines[0]?.trim() ?? '';
                if (!metaLine) {
                    issues.push({
                        file: filePath,
                        line: 1,
                        kind: 'missing_metadata_line',
                        message: `Missing or blank title/metadata line in ${fileName}`,
                        expected: 'Non-empty title line on line 1'
                    });
                }
            }

            // ── 3. Header line ──────────────────────────────────────────────────
            const headerLineIdx = validationLayout.headerLineIdx; // 0-based index of header row
            if (table.has_header_line && headerLineIdx >= 0) {
                if (headerLineIdx >= rawLines.length) {
                    issues.push({
                        file: filePath,
                        line: headerLineIdx + 1,
                        kind: 'missing_header_line',
                        message: `Missing or blank column-header line in ${fileName}`,
                        expected: `Column header on line ${headerLineIdx + 1}`
                    });
                } else {
                    const headerAnalysis = validationLayout.headerAnalysis;

                    if (headerAnalysis?.kind === 'missing_header_line') {
                        const message = rawLines[headerLineIdx]?.trim()
                            ? `Expected a column header in ${fileName}, but found a data row instead`
                            : `Missing or blank column-header line in ${fileName}`;

                        issues.push({
                            file: filePath,
                            line: headerLineIdx + 1,
                            kind: 'missing_header_line',
                            message,
                            expected: `Column header on line ${headerLineIdx + 1}`,
                            actual: headerAnalysis.actualHeaders.join(' ')
                        });
                    } else if (headerAnalysis?.kind === 'header_column_mismatch') {
                        const missingCount = headerAnalysis.expectedHeaders.length - headerAnalysis.matchedExpectedCount;

                        issues.push({
                            file: filePath,
                            line: headerLineIdx + 1,
                            kind: 'header_column_mismatch',
                            message: `Column-header mismatch in ${fileName}: ` +
                                `${missingCount} of ${headerAnalysis.expectedHeaders.length} expected columns not found in header`,
                            expected: headerAnalysis.expectedHeaders.join(' '),
                            actual: headerAnalysis.actualHeaders.join(' ')
                        });
                    }
                }
            }

            // ── 4. Row-level checks (standard tabular files only) ───────────────
            // Skip hierarchical and decision-table files for deep row inspection
            if (isHierarchical || isDtl) {
                continue;
            }

            const dataStartLine = validationLayout.dataStartLineIdx; // 0-based index of first data row
            const expectedColCount = physicalColumns.length;

            // Build per-column indices for typed checks (position in physicalColumns array)
            const integerColIndices: Array<{ idx: number; name: string }> = [];
            const decimalColIndices: Array<{ idx: number; name: string }> = [];
            const booleanColIndices: Array<{ idx: number; name: string }> = [];
            // Required (non-nullable) columns whose value must be present and not 'null'.
            // AutoField ids are database-generated, so they are never "required" in the file.
            const requiredColIndices: Array<{ idx: number; name: string }> = [];

            // Per-column "(meaning, units)" suffix from the enriched schema, so every
            // validation message explains what the column is. Built once per file.
            const enriched = getSharedEnrichedSchema();
            const columnContext = new Map<string, string>();

            physicalColumns.forEach((col, idx) => {
                const resolvedIdx = validationLayout.columnPositions.get(col.name) ?? idx;

                if (col.type === 'IntegerField' || col.type === 'PrimaryKeyField') {
                    integerColIndices.push({ idx: resolvedIdx, name: col.name });
                } else if (col.type === 'DoubleField') {
                    decimalColIndices.push({ idx: resolvedIdx, name: col.name });
                } else if (col.type === 'BooleanField') {
                    booleanColIndices.push({ idx: resolvedIdx, name: col.name });
                }

                if (col.nullable === false && col.type !== 'AutoField') {
                    requiredColIndices.push({ idx: resolvedIdx, name: col.name });
                }

                if (enriched) {
                    const ctx = formatColumnContext(enriched.getColumnDoc(fileName, col.name));
                    if (ctx) {
                        columnContext.set(col.name, ctx);
                    }
                }
            });

            const ctxFor = (name: string): string => columnContext.get(name) ?? '';

            let rowIssueCount = 0;

            for (let i = dataStartLine; i < rawLines.length; i++) {
                if (rowIssueCount >= MAX_ISSUES_PER_FILE) {
                    break;
                }

                const line = rawLines[i].trim();
                if (!line || line.startsWith('#')) {
                    continue;
                }

                const values = line.split(/\s+/);

                // ── 4a. Column count ───────────────────────────────────────────
                // Allow one trailing optional column to be absent (SWAT+ sometimes
                // adds optional parameters in newer versions), but flag when
                // significantly short.
                if (expectedColCount > 0 && values.length < expectedColCount - 1) {
                    issues.push({
                        file: filePath,
                        line: i + 1,
                        kind: 'wrong_column_count',
                        message: `Too few columns in ${fileName} at line ${i + 1}: ` +
                            `expected ${expectedColCount} columns, found ${values.length}`,
                        expected: `${expectedColCount}`,
                        actual: `${values.length}`
                    });
                    rowIssueCount++;
                    continue; // skip type checks for this malformed row
                }

                // ── 4b. Required (non-nullable) columns ────────────────────────
                for (const { idx, name } of requiredColIndices) {
                    if (rowIssueCount >= MAX_ISSUES_PER_FILE) { break; }
                    if (isMissingRequiredValue(values[idx])) {
                        issues.push({
                            file: filePath,
                            line: i + 1,
                            column: name,
                            kind: 'missing_required_value',
                            message: `Missing required value in ${fileName} at line ${i + 1}, ` +
                                `column "${name}"${ctxFor(name)}: found "${values[idx] ?? ''}"`,
                            expected: 'a value',
                            actual: values[idx] ?? ''
                        });
                        rowIssueCount++;
                    }
                }

                // ── 4c. Integer columns ────────────────────────────────────────
                for (const { idx, name } of integerColIndices) {
                    if (rowIssueCount >= MAX_ISSUES_PER_FILE) { break; }
                    const raw = values[idx];
                    if (!raw) { continue; }
                    if (nullSet.has(raw.toLowerCase())) { continue; }
                    // Number.isInteger correctly handles scientific notation (e.g. 1e2 parses to 100)
                    const num = Number(raw);
                    if (!Number.isFinite(num) || !Number.isInteger(num)) {
                        issues.push({
                            file: filePath,
                            line: i + 1,
                            column: name,
                            kind: 'invalid_integer',
                            message: `Invalid integer value in ${fileName} at line ${i + 1}, ` +
                                `column "${name}"${ctxFor(name)}: "${raw}"`,
                            expected: 'integer',
                            actual: raw
                        });
                        rowIssueCount++;
                    }
                }

                // ── 4d. Decimal columns ────────────────────────────────────────
                for (const { idx, name } of decimalColIndices) {
                    if (rowIssueCount >= MAX_ISSUES_PER_FILE) { break; }
                    const raw = values[idx];
                    if (!raw) { continue; }
                    if (nullSet.has(raw.toLowerCase())) { continue; }
                    if (!Number.isFinite(Number(raw))) {
                        issues.push({
                            file: filePath,
                            line: i + 1,
                            column: name,
                            kind: 'invalid_decimal',
                            message: `Invalid numeric value in ${fileName} at line ${i + 1}, ` +
                                `column "${name}"${ctxFor(name)}: "${raw}"`,
                            expected: 'number',
                            actual: raw
                        });
                        rowIssueCount++;
                    }
                }

                // ── 4e. Boolean columns ────────────────────────────────────────
                for (const { idx, name } of booleanColIndices) {
                    if (rowIssueCount >= MAX_ISSUES_PER_FILE) { break; }
                    const raw = values[idx];
                    if (!raw) { continue; }
                    if (nullSet.has(raw.toLowerCase())) { continue; }
                    if (!isAcceptedBooleanLiteral(raw, nullSet)) {
                        issues.push({
                            file: filePath,
                            line: i + 1,
                            column: name,
                            kind: 'invalid_boolean',
                            message: `Invalid boolean value in ${fileName} at line ${i + 1}, ` +
                                `column "${name}"${ctxFor(name)}: "${raw}" (expected 0/1, y/n, true/false, or yes/no)`,
                            expected: '0/1, y/n, true/false, or yes/no',
                            actual: raw
                        });
                        rowIssueCount++;
                    }
                }
            }
        }

        return issues;
    }
}
