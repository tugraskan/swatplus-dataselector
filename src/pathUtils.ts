/**
 * Path utilities for cross-platform path handling
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Normalize path separators to forward slashes.
 *
 * Required for cross-platform path comparison when a path that was stored by the
 * index on Windows (using `\`) is later compared against a path reported by VS Code
 * on Linux/macOS (using `/`).
 */
export function normalizeSeparators(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/**
 * Normalize a path for comparison, handling case-sensitivity based on platform and
 * path style.  Separators are always normalised to `/` first so that paths stored in
 * a Windows-built `index.json` can be compared with paths reported by VS Code when
 * running under WSL, Codespaces, or a Linux/macOS host.
 *
 * Case folding rules:
 *  – Windows native (`process.platform === 'win32'`): always lowercase.
 *  – Windows-format drive paths loaded on a non-Windows host (`C:/…`): lowercase,
 *    because the underlying NTFS volume is case-insensitive regardless of the host OS.
 *    The pattern is applied after `normalizeSeparators`, so `\` has already been
 *    converted to `/` and the regex only needs to match `C:/` style prefixes.
 *  – All other paths: preserved as-is (case-sensitive).
 */
export function normalizePathForComparison(filePath: string): string {
    // Always normalize separators so Windows '\' and POSIX '/' compare correctly
    const withSlashes = normalizeSeparators(filePath);
    // Windows native, or Windows-format drive path on a non-Windows host.
    // After normalizeSeparators all separators are '/', so we only need to
    // match the C:/ style prefix here.
    const isCaseInsensitive =
        process.platform === 'win32' || /^[A-Za-z]:\//.test(withSlashes);
    return isCaseInsensitive ? withSlashes.toLowerCase() : withSlashes;
}

/**
 * Check if a path starts with another path, using platform-appropriate case sensitivity.
 * On Windows: case-insensitive comparison
 * On Unix: case-sensitive comparison
 *
 * This function ensures the prefix represents a valid parent directory by checking
 * for a path separator after the prefix.  Both `/` and `\` are treated as separators
 * so that mixed-separator paths (e.g. from a Windows-built cache) are handled
 * correctly.
 */
export function pathStartsWith(fullPath: string, prefixPath: string): boolean {
    const normalizedFull = normalizePathForComparison(fullPath);
    let normalizedPrefix = normalizePathForComparison(prefixPath);

    // Remove trailing separator from prefix for consistent comparison.
    // After normalizeSeparators all separators are '/', so only check '/'.
    if (normalizedPrefix.endsWith('/')) {
        normalizedPrefix = normalizedPrefix.slice(0, -1);
    }

    if (!normalizedFull.startsWith(normalizedPrefix)) {
        return false;
    }

    // Ensure the prefix is followed by a path separator or is the full path.
    // This prevents false positives like '/home/user1' matching '/home/user'.
    if (normalizedFull.length === normalizedPrefix.length) {
        return true; // Exact match
    }

    // After separator normalization all separators are '/'.
    return normalizedFull.charAt(normalizedPrefix.length) === '/';
}

/**
 * Convert a Windows-style path to its WSL `/mnt/<drive>/` equivalent.
 *
 * Examples:
 *   `C:\Users\foo\bar`  → `/mnt/c/Users/foo/bar`
 *   `D:/datasets/Ames`  → `/mnt/d/datasets/Ames`
 *
 * Returns the original string unchanged if it does not match a Windows path pattern.
 */
export function windowsPathToWsl(winPath: string): string {
    const match = winPath.match(/^([A-Za-z]):[\\\/](.*)/);
    if (!match) {
        return winPath;
    }
    const drive = match[1].toLowerCase();
    const rest  = match[2].replace(/\\/g, '/');
    // Collapse any consecutive slashes and strip a trailing slash
    return `/mnt/${drive}/${rest}`.replace(/\/+/g, '/').replace(/\/$/, '');
}

/**
 * Convert a WSL `/mnt/<drive>/` path back to its Windows-style equivalent.
 *
 * Examples:
 *   `/mnt/c/Users/foo/bar`  → `C:\Users\foo\bar`
 *   `/mnt/d/datasets/Ames`  → `D:\datasets\Ames`
 *
 * Returns the original string unchanged if it does not match a `/mnt/<drive>/` pattern.
 */
export function wslPathToWindows(wslPath: string): string {
    const match = wslPath.match(/^\/mnt\/([a-z])(?:\/(.*))?$/);
    if (!match) {
        return wslPath;
    }
    const drive = match[1].toUpperCase();
    const rest  = (match[2] || '').replace(/\//g, '\\');
    return rest ? `${drive}:\\${rest}` : `${drive}:\\`;
}

/**
 * Normalise a file path that was stored in the index (or a persisted `index.json`
 * cache) so that it is valid for the current OS environment.
 *
 * When an `index.json` that was built on Windows (paths like `C:\Users\…`) is later
 * loaded on a Linux/macOS host (WSL, Codespaces, Remote SSH, Dev Container) the
 * stored paths are not directly usable.  This function converts Windows drive-letter
 * paths to their WSL `/mnt/<drive>/…` equivalents on non-Windows hosts.  POSIX paths
 * and paths already in the correct format are returned unchanged.
 */
export function normalizeIndexedPath(p: string): string {
    if (!p) {
        return p;
    }
    // On a non-Windows host, convert Windows drive paths (C:\… or C:/…) to POSIX
    if (process.platform !== 'win32' && /^[A-Za-z]:[\\\/]/.test(p)) {
        return windowsPathToWsl(p);
    }
    return p;
}

/**
 * Resolve the case-sensitive path to file.cio within a dataset folder.
 * Falls back to File.cio for datasets created on case-insensitive filesystems.
 */
export function resolveFileCioPath(datasetPath: string): string | null {
    const lowerCasePath = path.join(datasetPath, 'file.cio');
    if (fs.existsSync(lowerCasePath)) {
        return lowerCasePath;
    }

    const upperCasePath = path.join(datasetPath, 'File.cio');
    if (fs.existsSync(upperCasePath)) {
        return upperCasePath;
    }

    return null;
}
