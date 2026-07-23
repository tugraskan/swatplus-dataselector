import type { FKReference } from './indexer';

interface FilePointerMetadata {
    file_pointer_columns?: Record<string, unknown>;
}

/**
 * Suppress unresolved FK diagnostics for values that are modeled as file
 * pointers in metadata. These should be handled by the file-pointer checker.
 */
export function shouldSuppressUnresolvedFkDiagnostic(
    ref: FKReference,
    metadata: FilePointerMetadata | null
): boolean {
    const filePointerColumns = metadata?.file_pointer_columns;
    if (!filePointerColumns) {
        return false;
    }

    // Extract the file name in a separator-agnostic way: node's path.basename is
    // platform-specific (POSIX ignores '\\'), so a Windows-style path processed on
    // Linux/WSL — or vice versa — would otherwise fail to match. Split on both.
    const sourceFileName = (ref.sourceFile.split(/[\\/]/).pop() ?? '').toLowerCase();
    const sourceConfigEntry = Object.entries(filePointerColumns).find(
        ([fileName]) => fileName.toLowerCase() === sourceFileName
    );
    if (!sourceConfigEntry) {
        return false;
    }

    const [, columnConfig] = sourceConfigEntry;
    if (!columnConfig || typeof columnConfig !== 'object' || Array.isArray(columnConfig)) {
        return false;
    }

    const columnEntry = Object.entries(columnConfig as Record<string, unknown>).find(
        ([columnName]) => columnName !== 'description' && columnName.toLowerCase() === ref.sourceColumn.toLowerCase()
    );
    if (!columnEntry) {
        return false;
    }

    const [, columnDefinition] = columnEntry;
    const hasFilePattern = typeof columnDefinition === 'object' &&
        columnDefinition !== null &&
        'file_pattern' in columnDefinition;

    return hasFilePattern || ref.fkValue.includes('.');
}
