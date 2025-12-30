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
 * 
 * This function ensures the prefix represents a valid parent directory by checking
 * for a path separator after the prefix.
 */
export function pathStartsWith(fullPath: string, prefixPath: string): boolean {
    const normalizedFull = normalizePathForComparison(fullPath);
    const normalizedPrefix = normalizePathForComparison(prefixPath);
    
    if (!normalizedFull.startsWith(normalizedPrefix)) {
        return false;
    }
    
    // Ensure the prefix is followed by a path separator or is the full path
    // This prevents false positives like '/home/user1' matching '/home/user'
    if (normalizedFull.length === normalizedPrefix.length) {
        return true; // Exact match
    }
    
    const charAfterPrefix = normalizedFull.charAt(normalizedPrefix.length);
    return charAfterPrefix === path.sep || charAfterPrefix === '/';
}
