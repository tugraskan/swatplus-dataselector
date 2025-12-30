/**
 * Path utilities for cross-platform path handling
 */

import * as path from 'path';

/**
 * Normalize a path for comparison, handling case-sensitivity based on platform.
 * On Windows, returns lowercase path for case-insensitive comparison.
 * On Unix, returns path as-is for case-sensitive comparison.
 */
export function normalizePathForComparison(filePath: string): string {
    const normalized = path.normalize(filePath);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * Check if a path starts with another path, using platform-appropriate case sensitivity.
 * On Windows: case-insensitive comparison
 * On Unix: case-sensitive comparison
 */
export function pathStartsWith(fullPath: string, prefixPath: string): boolean {
    const normalizedFull = normalizePathForComparison(fullPath);
    const normalizedPrefix = normalizePathForComparison(prefixPath);
    return normalizedFull.startsWith(normalizedPrefix);
}
