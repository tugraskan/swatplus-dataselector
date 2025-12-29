import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SWAT+ Database Navigation Features
 * Provides Go to Definition, Hover, Peek Definition, and CodeLens for SWAT+ text files
 * 
 * Foreign key relationships are discovered automatically by:
 * 1. Reading column headers from SWAT+ files
 * 2. Matching column names to other file names in the dataset
 * 3. Treating matching columns as foreign keys
 */

// Detected foreign key relationship
interface SwatFileRelation {
    sourceFile: string;  // e.g., "hru"
    foreignKeyColumn: number;  // Column index in source file
    columnName: string;  // e.g., "hydrology"
    targetFile: string;  // e.g., "hydrology"
    targetKeyColumn: number;  // Column index in target file (usually 0 - name column)
    fieldName: string;  // Friendly name like "Hydrology" or "Topography"
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
 * Discover foreign key relationships by reading file headers
 * A column is considered a foreign key if its name matches another file's base name
 */
function discoverRelationships(directory: string): SwatFileRelation[] {
    const relations: SwatFileRelation[] = [];
    const swatFiles = getSwatFiles(directory);
    
    // Build a map of file base names (without extension) to file names
    const fileBaseNames = new Map<string, string>();
    for (const file of swatFiles) {
        const baseName = path.basename(file, path.extname(file));
        fileBaseNames.set(baseName.toLowerCase(), file);
    }
    
    // For each file, check if any column names match other file base names
    for (const sourceFile of swatFiles) {
        const sourceFilePath = path.join(directory, sourceFile);
        const headers = getFileHeader(sourceFilePath);
        const sourceBaseName = path.basename(sourceFile, path.extname(sourceFile));
        
        // Skip the first column (usually 'name' or ID)
        for (let colIndex = 1; colIndex < headers.length; colIndex++) {
            const columnName = headers[colIndex].toLowerCase();
            
            // Check if this column name matches any file base name
            if (fileBaseNames.has(columnName)) {
                const targetFile = fileBaseNames.get(columnName)!;
                
                relations.push({
                    sourceFile: sourceBaseName.toLowerCase(),
                    foreignKeyColumn: colIndex,
                    columnName: columnName,
                    targetFile: path.basename(targetFile, path.extname(targetFile)).toLowerCase(),
                    targetKeyColumn: 0, // First column is assumed to be the key
                    fieldName: capitalizeFirst(columnName)
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
    if (!relationshipCache.has(directory)) {
        const relations = discoverRelationships(directory);
        relationshipCache.set(directory, relations);
        console.log(`Discovered ${relations.length} foreign key relationships in ${directory}:`, 
            relations.map(r => `${r.sourceFile}.${r.columnName} → ${r.targetFile}`));
    }
    return relationshipCache.get(directory)!;
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
        const directory = path.dirname(document.fileName);
        const fileName = path.basename(document.fileName).replace(/\.(txt|hru|hyd|sol|cli|pcp|tmp|wnd)$/, '');
        const line = document.lineAt(position.line);
        const lineText = line.text;
        
        // Get relationships for this directory
        const relations = getRelationships(directory);
        
        // Parse the line to get fields
        const fields = lineText.trim().split(/\s+/);
        
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
        
        if (currentColumn === -1) {
            return undefined;
        }
        
        // Check if this column is a foreign key
        const relation = relations.find(r => 
            fileName.toLowerCase().includes(r.sourceFile) && r.foreignKeyColumn === currentColumn
        );
        
        if (!relation) {
            return undefined;
        }
        
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
                break;
            }
        }
        
        if (!fs.existsSync(actualTargetPath)) {
            return undefined;
        }
        
        // Find the target record
        const keyValue = fields[currentColumn];
        const targetRecord = findRecordByKey(actualTargetPath, keyValue, relation.targetKeyColumn);
        
        if (!targetRecord) {
            return undefined;
        }
        
        // Return the location
        return new vscode.Location(
            vscode.Uri.file(targetRecord.file),
            new vscode.Position(targetRecord.line, 0)
        );
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
    
    console.log('SWAT+ language features registered with automatic relationship discovery');
}
