import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SWAT_SCHEMA_RELATIONS, SchemaRelation, getFileVariations } from './swatPlusSchema';

/**
 * SWAT+ Database Navigation Features
 * Provides Go to Definition, Hover, Peek Definition, and CodeLens for SWAT+ text files
 * 
 * Foreign key relationships are discovered using:
 * 1. PRIMARY: SWAT+ Editor schema (official database schema)
 * 2. FALLBACK: Automatic discovery by matching column names to file names
 */

// Detected foreign key relationship
interface SwatFileRelation {
    sourceFile: string;  // e.g., "hru"
    foreignKeyColumn: number;  // Column index in source file
    columnName: string;  // e.g., "hydrology"
    targetFile: string;  // e.g., "hydrology"
    targetKeyColumn: number;  // Column index in target file (usually 0 - name column)
    fieldName: string;  // Friendly name like "Hydrology" or "Topography"
    source: 'schema' | 'discovered';  // Track where this relationship came from
}

/**
 * Get the header (column names) from a SWAT+ file
 */
function getFileHeader(filePath: string): string[] {
    try {
        if (!fs.existsSync(filePath)) {
            return [];
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        if (lines.length === 0) {
            return [];
        }
        
        // First line is the header
        const headerLine = lines[0].trim();
        return headerLine.split(/\s+/).filter(f => f.length > 0);
    } catch (error) {
        console.error('Error reading file header:', error);
        return [];
    }
}

/**
 * Get all SWAT+ files in a directory
 */
function getSwatFiles(directory: string): string[] {
    try {
        if (!fs.existsSync(directory)) {
            return [];
        }
        
        const files = fs.readdirSync(directory);
        const swatExtensions = ['.hru', '.hyd', '.sol', '.cli', '.pcp', '.tmp', '.wnd', '.txt'];
        
        return files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return swatExtensions.includes(ext);
        });
    } catch (error) {
        console.error('Error reading directory:', error);
        return [];
    }
}

/**
 * Find a file in directory that matches a target base name
 * Tries various naming patterns and extensions
 */
function findFileForBaseName(directory: string, baseName: string, availableFiles: string[]): string | undefined {
    const variations = getFileVariations(baseName);
    
    for (const variation of variations) {
        const found = availableFiles.find(f => f.toLowerCase() === variation.toLowerCase());
        if (found) {
            return found;
        }
    }
    
    // Also try matching just the base name (case-insensitive)
    const baseNameLower = baseName.toLowerCase().replace(/_/g, '-');
    return availableFiles.find(f => {
        const fileBase = path.basename(f, path.extname(f)).toLowerCase().replace(/_/g, '-');
        return fileBase === baseNameLower || fileBase.includes(baseNameLower) || baseNameLower.includes(fileBase);
    });
}

/**
 * Discover foreign key relationships using SWAT+ Editor schema (PRIMARY METHOD)
 * Falls back to automatic discovery if schema doesn't find relationships
 */
function discoverRelationships(directory: string): SwatFileRelation[] {
    console.log(`[SWAT+] discoverRelationships START for: ${directory}`);
    const relations: SwatFileRelation[] = [];
    const swatFiles = getSwatFiles(directory);
    
    console.log(`[SWAT+] Found ${swatFiles.length} SWAT files in directory`);
    
    if (swatFiles.length === 0) {
        console.log(`[SWAT+] No SWAT files found, returning empty relations`);
        return relations;
    }
    
    // Build a map of available files for quick lookup
    const fileMap = new Map<string, string>();
    for (const file of swatFiles) {
        const baseName = path.basename(file, path.extname(file)).toLowerCase();
        fileMap.set(baseName, file);
    }
    
    // STEP 1: Use SWAT+ Editor schema (PRIMARY)
    const schemaRelations = discoverFromSchema(directory, swatFiles, fileMap);
    relations.push(...schemaRelations);
    
    // STEP 2: Fall back to automatic discovery for any remaining relationships (BACKUP)
    const autoRelations = discoverFromHeaders(directory, swatFiles, fileMap);
    
    // Add auto-discovered relations that aren't already in schema
    for (const autoRel of autoRelations) {
        const isDuplicate = relations.some(r => 
            r.sourceFile === autoRel.sourceFile && 
            r.foreignKeyColumn === autoRel.foreignKeyColumn
        );
        if (!isDuplicate) {
            relations.push(autoRel);
        }
    }
    
    return relations;
}

/**
 * Discover relationships from SWAT+ Editor schema
 */
function discoverFromSchema(directory: string, swatFiles: string[], fileMap: Map<string, string>): SwatFileRelation[] {
    const relations: SwatFileRelation[] = [];
    
    console.log(`[SWAT+] Discovering from schema in ${directory}`);
    console.log(`[SWAT+] Available files:`, swatFiles);
    
    for (const schemaRel of SWAT_SCHEMA_RELATIONS) {
        // Find source file
        const sourceFile = findFileForBaseName(directory, schemaRel.sourceFile, swatFiles);
        if (!sourceFile) {
            continue;
        }
        
        // Find target file
        const targetFile = findFileForBaseName(directory, schemaRel.targetFile, swatFiles);
        if (!targetFile) {
            continue;
        }
        
        // Read source file headers to find column index
        const sourceFilePath = path.join(directory, sourceFile);
        const headers = getFileHeader(sourceFilePath);
        
        // Find the column index by matching field name
        const columnIndex = headers.findIndex(h => 
            h.toLowerCase() === schemaRel.foreignKeyField.toLowerCase()
        );
        
        if (columnIndex === -1 || columnIndex === 0) {
            // Column not found or is the name column, skip
            console.log(`[SWAT+] Column ${schemaRel.foreignKeyField} not found in ${sourceFile}, headers:`, headers);
            continue;
        }
        
        const sourceBaseName = path.basename(sourceFile, path.extname(sourceFile));
        const targetBaseName = path.basename(targetFile, path.extname(targetFile));
        
        const relation = {
            sourceFile: sourceBaseName.toLowerCase(),
            foreignKeyColumn: columnIndex,
            columnName: schemaRel.foreignKeyField.toLowerCase(),
            targetFile: targetBaseName.toLowerCase(),
            targetKeyColumn: 0, // First column is the key
            fieldName: schemaRel.fieldName,
            source: 'schema' as const
        };
        
        console.log(`[SWAT+] Schema relation added:`, relation);
        relations.push(relation);
    }
    
    console.log(`[SWAT+] Total schema relations found: ${relations.length}`);
    return relations;
}

/**
 * Discover foreign key relationships by reading file headers (BACKUP METHOD)
 * A column is considered a foreign key if its name matches another file's base name
 */
function discoverFromHeaders(directory: string, swatFiles: string[], fileMap: Map<string, string>): SwatFileRelation[] {
    const relations: SwatFileRelation[] = [];
    
    // For each file, check if any column names match other file base names
    for (const sourceFile of swatFiles) {
        const sourceFilePath = path.join(directory, sourceFile);
        const headers = getFileHeader(sourceFilePath);
        const sourceBaseName = path.basename(sourceFile, path.extname(sourceFile));
        
        // Skip the first column (usually 'name' or ID)
        for (let colIndex = 1; colIndex < headers.length; colIndex++) {
            const columnName = headers[colIndex].toLowerCase();
            
            // Check if this column name matches any file base name
            if (fileMap.has(columnName)) {
                const targetFile = fileMap.get(columnName)!;
                
                relations.push({
                    sourceFile: sourceBaseName.toLowerCase(),
                    foreignKeyColumn: colIndex,
                    columnName: columnName,
                    targetFile: path.basename(targetFile, path.extname(targetFile)).toLowerCase(),
                    targetKeyColumn: 0, // First column is assumed to be the key
                    fieldName: capitalizeFirst(columnName),
                    source: 'discovered'
                });
            }
        }
    }
    
    return relations;
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirst(str: string): string {
    if (!str) {
        return str;
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Cache for discovered relationships per directory
 */
const relationshipCache = new Map<string, SwatFileRelation[]>();

/**
 * Get relationships for a directory, using cache when available
 */
function getRelationships(directory: string): SwatFileRelation[] {
    try {
        console.log(`[SWAT+] getRelationships START`);
        console.log(`[SWAT+] Directory: ${directory}`);
        console.log(`[SWAT+] Checking cache...`);
        
        const hasCache = relationshipCache.has(directory);
        console.log(`[SWAT+] Cache has directory: ${hasCache}`);
        
        if (!hasCache) {
            console.log(`[SWAT+] Cache miss, discovering relationships...`);
            const relations = discoverRelationships(directory);
            console.log(`[SWAT+] Discovery complete, caching ${relations.length} relations...`);
            relationshipCache.set(directory, relations);
            
            const schemaCount = relations.filter(r => r.source === 'schema').length;
            const discoveredCount = relations.filter(r => r.source === 'discovered').length;
            
            console.log(`SWAT+ Foreign Key Discovery in ${directory}:`);
            console.log(`  - ${schemaCount} from schema (primary)`);
            console.log(`  - ${discoveredCount} auto-discovered (fallback)`);
            console.log(`  - Total: ${relations.length} relationships`);
            if (relations.length > 0) {
                console.log('  Relationships:', relations.map(r => 
                    `${r.sourceFile}.${r.columnName} → ${r.targetFile} [${r.source}]`
                ));
            }
        } else {
            console.log(`[SWAT+] Using cached relationships`);
        }
        
        const result = relationshipCache.get(directory)!;
        console.log(`[SWAT+] Returning ${result.length} relationships`);
        return result;
    } catch (error) {
        console.error('[SWAT+] Error in getRelationships:', error);
        return [];
    }
}

/**
 * Clear the relationship cache (useful when files change)
 */
export function clearRelationshipCache(): void {
    relationshipCache.clear();
}

interface SwatRecord {
    file: string;
    line: number;
    fields: string[];
}

/**
 * Parse a SWAT+ text file and return records
 */
function parseSwatFile(filePath: string): SwatRecord[] {
    try {
        if (!fs.existsSync(filePath)) {
            return [];
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const records: SwatRecord[] = [];
        
        // Skip header lines (typically first line is column headers)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) {
                continue;
            }
            
            // Split by whitespace (SWAT+ files are space/tab delimited)
            const fields = line.split(/\s+/).filter(f => f.length > 0);
            if (fields.length > 0) {
                records.push({
                    file: filePath,
                    line: i,
                    fields
                });
            }
        }
        
        return records;
    } catch (error) {
        console.error('Error parsing SWAT+ file:', error);
        return [];
    }
}

/**
 * Find a record by key value in a SWAT+ file
 */
function findRecordByKey(filePath: string, keyValue: string, keyColumn: number = 0): SwatRecord | undefined {
    const records = parseSwatFile(filePath);
    return records.find(record => record.fields[keyColumn] === keyValue);
}

/**
 * Get all records from a file (for peek/hover previews)
 */
function getAllRecords(filePath: string): SwatRecord[] {
    return parseSwatFile(filePath);
}

/**
 * Definition Provider - Go to Definition (F12)
 */
export class SwatDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private workspaceFolder: string) {}
    
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition> {
        try {
            const directory = path.dirname(document.fileName);
            const fileName = path.basename(document.fileName).replace(/\.(txt|hru|hyd|sol|cli|pcp|tmp|wnd)$/, '');
            const line = document.lineAt(position.line);
            const lineText = line.text;
            
            console.log(`[SWAT+] Definition requested for file: ${fileName}, line: ${position.line}, char: ${position.character}`);
            console.log(`[SWAT+] Directory: ${directory}`);
            console.log(`[SWAT+] Line text: "${lineText}"`);
            
            // Get relationships for this directory
            console.log(`[SWAT+] Getting relationships...`);
            const relations = getRelationships(directory);
            
            console.log(`[SWAT+] Found ${relations.length} total relationships`);
            const matchingRelations = relations.filter(r => fileName.toLowerCase().includes(r.sourceFile));
            console.log(`[SWAT+] Relationships for ${fileName}:`, matchingRelations);
            
            // Parse the line to get fields
            const fields = lineText.trim().split(/\s+/);
            console.log(`[SWAT+] Line fields:`, fields);
            
            // Find which column the cursor is on
            let currentColumn = -1;
            let charCount = 0;
            for (let i = 0; i < fields.length; i++) {
                const fieldStart = lineText.indexOf(fields[i], charCount);
                const fieldEnd = fieldStart + fields[i].length;
                if (position.character >= fieldStart && position.character <= fieldEnd) {
                    currentColumn = i;
                    break;
                }
                charCount = fieldEnd;
            }
            
            console.log(`[SWAT+] Current column: ${currentColumn}, value: ${fields[currentColumn]}`);
            
            if (currentColumn === -1) {
                console.log('[SWAT+] Could not determine column');
                return undefined;
            }
            
            // Check if this column is a foreign key
            const relation = relations.find(r => 
                fileName.toLowerCase().includes(r.sourceFile) && r.foreignKeyColumn === currentColumn
            );
            
            if (!relation) {
                console.log(`[SWAT+] No relationship found for ${fileName} column ${currentColumn}`);
                return undefined;
            }
            
            console.log(`[SWAT+] Found relationship:`, relation);
            
            // Find the target file
            const targetFileName = `${relation.targetFile}.hru`;
            const targetFilePath = path.join(directory, targetFileName);
            
            // Try different extensions
            const possibleExtensions = ['.hru', '.hyd', '.txt', '.sol', '.cli', '.pcp', '.tmp', '.wnd'];
            let actualTargetPath = targetFilePath;
            
            for (const ext of possibleExtensions) {
                const testPath = path.join(directory, `${relation.targetFile}${ext}`);
                if (fs.existsSync(testPath)) {
                    actualTargetPath = testPath;
                    console.log(`[SWAT+] Found target file: ${actualTargetPath}`);
                    break;
                }
            }
            
            if (!fs.existsSync(actualTargetPath)) {
                console.log(`[SWAT+] Target file not found: ${actualTargetPath}`);
                return undefined;
            }
            
            // Find the target record
            const keyValue = fields[currentColumn];
            console.log(`[SWAT+] Looking for key value: ${keyValue} in ${actualTargetPath}`);
            const targetRecord = findRecordByKey(actualTargetPath, keyValue, relation.targetKeyColumn);
            
            if (!targetRecord) {
                console.log(`[SWAT+] Target record not found for key: ${keyValue}`);
                return undefined;
            }
            
            console.log(`[SWAT+] Found target record at line ${targetRecord.line}`);
            
            // Return the location
            return new vscode.Location(
                vscode.Uri.file(targetRecord.file),
                new vscode.Position(targetRecord.line, 0)
            );
        } catch (error) {
            console.error('[SWAT+] Error in provideDefinition:', error);
            vscode.window.showErrorMessage(`SWAT+ Navigation Error: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
}

/**
 * Hover Provider - Enhanced hover preview with up to 8 key fields
 */
export class SwatHoverProvider implements vscode.HoverProvider {
    constructor(private workspaceFolder: string) {}
    
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const directory = path.dirname(document.fileName);
        const fileName = path.basename(document.fileName).replace(/\.(txt|hru|hyd|sol|cli|pcp|tmp|wnd)$/, '');
        const line = document.lineAt(position.line);
        const lineText = line.text;
        
        // Get relationships for this directory
        const relations = getRelationships(directory);
        
        // Parse the line
        const fields = lineText.trim().split(/\s+/);
        
        // Find which column
        let currentColumn = -1;
        let charCount = 0;
        let wordRange: vscode.Range | undefined;
        
        for (let i = 0; i < fields.length; i++) {
            const fieldStart = lineText.indexOf(fields[i], charCount);
            const fieldEnd = fieldStart + fields[i].length;
            if (position.character >= fieldStart && position.character <= fieldEnd) {
                currentColumn = i;
                wordRange = new vscode.Range(
                    position.line, fieldStart,
                    position.line, fieldEnd
                );
                break;
            }
            charCount = fieldEnd;
        }
        
        if (currentColumn === -1) {
            return undefined;
        }
        
        // Check if this is a foreign key
        const relation = relations.find(r => 
            fileName.toLowerCase().includes(r.sourceFile) && r.foreignKeyColumn === currentColumn
        );
        
        if (!relation) {
            return undefined;
        }
        
        // Find target file
        const possibleExtensions = ['.hru', '.hyd', '.txt', '.sol', '.cli', '.pcp', '.tmp', '.wnd'];
        let actualTargetPath: string | undefined;
        
        for (const ext of possibleExtensions) {
            const testPath = path.join(directory, `${relation.targetFile}${ext}`);
            if (fs.existsSync(testPath)) {
                actualTargetPath = testPath;
                break;
            }
        }
        
        if (!actualTargetPath) {
            return undefined;
        }
        
        // Find the record
        const keyValue = fields[currentColumn];
        const targetRecord = findRecordByKey(actualTargetPath, keyValue, relation.targetKeyColumn);
        
        if (!targetRecord) {
            return undefined;
        }
        
        // Build rich hover content with up to 8 fields
        const markdownContent = new vscode.MarkdownString();
        markdownContent.appendMarkdown(`### 🔗 ${relation.fieldName}: \`${keyValue}\`\n\n`);
        
        // Show up to 8 fields with formatted values
        const maxFields = Math.min(8, targetRecord.fields.length);
        for (let i = 0; i < maxFields; i++) {
            const value = targetRecord.fields[i];
            // Format numbers for easier reading
            const numValue = Number(value);
            const formattedValue = isNaN(numValue) ? value : numValue.toLocaleString();
            markdownContent.appendMarkdown(`**Field ${i + 1}:** ${formattedValue}\n\n`);
        }
        
        if (targetRecord.fields.length > 8) {
            markdownContent.appendMarkdown(`*...and ${targetRecord.fields.length - 8} more fields*\n\n`);
        }
        
        markdownContent.appendMarkdown('---\n\n');
        markdownContent.appendMarkdown('💡 **Actions:**\n');
        markdownContent.appendMarkdown('- Press **F12** to go to definition\n');
        markdownContent.appendMarkdown('- Press **Alt+F12** to peek definition\n');
        markdownContent.appendMarkdown('- **Right-click** for more options\n');
        
        return new vscode.Hover(markdownContent, wordRange);
    }
}

/**
 * CodeLens Provider - Shows referenced foreign keys above rows
 */
export class SwatCodeLensProvider implements vscode.CodeLensProvider {
    constructor(private workspaceFolder: string) {}
    
    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const directory = path.dirname(document.fileName);
        const fileName = path.basename(document.fileName).replace(/\.(txt|hru|hyd|sol|cli|pcp|tmp|wnd)$/, '');
        const codeLenses: vscode.CodeLens[] = [];
        
        // Get relationships for this directory
        const allRelations = getRelationships(directory);
        
        // Find all relations for this file
        const relations = allRelations.filter(r => fileName.toLowerCase().includes(r.sourceFile));
        
        if (relations.length === 0) {
            return codeLenses;
        }
        
        // Parse the document
        const text = document.getText();
        const lines = text.split('\n');
        
        for (let lineNum = 1; lineNum < lines.length; lineNum++) {
            const lineText = lines[lineNum].trim();
            if (!lineText || lineText.startsWith('#')) {
                continue;
            }
            
            const fields = lineText.split(/\s+/).filter(f => f.length > 0);
            if (fields.length === 0) {
                continue;
            }
            
            // Build reference summary
            const references: string[] = [];
            
            for (const relation of relations) {
                if (relation.foreignKeyColumn >= fields.length) {
                    continue;
                }
                
                const keyValue = fields[relation.foreignKeyColumn];
                references.push(`${relation.fieldName}: ${keyValue}`);
            }
            
            if (references.length > 0) {
                const range = new vscode.Range(lineNum, 0, lineNum, 0);
                const lens = new vscode.CodeLens(range, {
                    title: `🔗 Referenced: ${references.join(' | ')}`,
                    command: ''
                });
                codeLenses.push(lens);
            }
        }
        
        return codeLenses;
    }
}

/**
 * Register all SWAT+ language features
 */
export function registerSwatLanguageFeatures(context: vscode.ExtensionContext, workspaceFolder: string): void {
    // Define the selector for SWAT+ files
    const swatSelector: vscode.DocumentSelector = [
        { scheme: 'file', pattern: '**/*.hru' },
        { scheme: 'file', pattern: '**/*.hyd' },
        { scheme: 'file', pattern: '**/*.sol' },
        { scheme: 'file', pattern: '**/*.cli' },
        { scheme: 'file', pattern: '**/*.pcp' },
        { scheme: 'file', pattern: '**/*.tmp' },
        { scheme: 'file', pattern: '**/*.wnd' },
        { scheme: 'file', pattern: '**/*hru*.txt' },
        { scheme: 'file', pattern: '**/*hydrology*.txt' },
        { scheme: 'file', pattern: '**/*topography*.txt' },
    ];
    
    // Register Definition Provider (F12)
    const definitionProvider = vscode.languages.registerDefinitionProvider(
        swatSelector,
        new SwatDefinitionProvider(workspaceFolder)
    );
    
    // Register Hover Provider
    const hoverProvider = vscode.languages.registerHoverProvider(
        swatSelector,
        new SwatHoverProvider(workspaceFolder)
    );
    
    // Register CodeLens Provider
    const codeLensProvider = vscode.languages.registerCodeLensProvider(
        swatSelector,
        new SwatCodeLensProvider(workspaceFolder)
    );
    
    // Register command to refresh foreign key relationships
    const refreshCommand = vscode.commands.registerCommand('swat-dataset-selector.refreshRelationships', () => {
        clearRelationshipCache();
        vscode.window.showInformationMessage('SWAT+ foreign key relationships refreshed');
        // Refresh CodeLens displays
        vscode.commands.executeCommand('editor.action.showReferences');
    });
    
    // Watch for file changes to refresh relationships automatically
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{hru,hyd,sol,cli,pcp,tmp,wnd,txt}');
    
    fileWatcher.onDidCreate(() => {
        clearRelationshipCache();
        console.log('SWAT+ file created, relationships refreshed');
    });
    
    fileWatcher.onDidDelete(() => {
        clearRelationshipCache();
        console.log('SWAT+ file deleted, relationships refreshed');
    });
    
    fileWatcher.onDidChange(() => {
        // Only clear cache when header might have changed
        clearRelationshipCache();
        console.log('SWAT+ file changed, relationships refreshed');
    });
    
    context.subscriptions.push(
        definitionProvider, 
        hoverProvider, 
        codeLensProvider, 
        refreshCommand,
        fileWatcher
    );
    
    console.log('SWAT+ language features registered with schema-based relationship discovery (primary) and automatic fallback');
}
