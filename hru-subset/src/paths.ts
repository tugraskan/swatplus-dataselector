// Where the subset goes. The rule: next to the dataset, never inside it. A
// subset inside the dataset folder is what let Dataset Selector's output be
// picked as the dataset by mistake. No vscode import.

import * as path from 'path';

function pathApi(platform: NodeJS.Platform): typeof path.posix {
    return platform === 'win32' ? path.win32 : path.posix;
}

/** yyyymmdd_hhmmss in local time, the stamp the script's own multi_<stamp> names use. */
export function formatTimestamp(date: Date): string {
    const two = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`
        + `_${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}

/** True when `child` is `parent` or lies under it. Case-insensitive on Windows. */
export function isSameOrInside(child: string, parent: string, platform: NodeJS.Platform = process.platform): boolean {
    const api = pathApi(platform);
    const relative = api.relative(api.resolve(parent), api.resolve(child));
    if (relative === '') {
        return true;
    }
    return relative !== '..' && !relative.startsWith(`..${api.sep}`) && !api.isAbsolute(relative);
}

/**
 * `<dataset>_subset_<yyyymmdd_hhmmss>` in the dataset's parent folder: a sibling
 * of the dataset, so it can never be inside it.
 */
export function defaultOutputPath(datasetDir: string, now: Date, platform: NodeJS.Platform = process.platform): string {
    const api = pathApi(platform);
    const dataset = api.resolve(datasetDir);
    const name = api.basename(dataset) || 'dataset';
    return api.join(api.dirname(dataset), `${name}_subset_${formatTimestamp(now)}`);
}

/** Subset folder named after the dataset, inside a parent folder the user chose. */
export function outputPathInside(parentDir: string, datasetDir: string, now: Date, platform: NodeJS.Platform = process.platform): string {
    const api = pathApi(platform);
    const name = api.basename(api.resolve(datasetDir)) || 'dataset';
    return api.join(api.resolve(parentDir), `${name}_subset_${formatTimestamp(now)}`);
}

/**
 * `candidate`, or `candidate_2`, `candidate_3`, ... until the name is free. The
 * run always writes to a folder that does not exist yet, so the script never
 * needs --overwrite and never picks its own alternative name, and a failed run
 * can only have created the folder we are about to name.
 */
export function uniqueOutputPath(candidate: string, exists: (p: string) => boolean): string {
    if (!exists(candidate)) {
        return candidate;
    }
    for (let suffix = 2; ; suffix++) {
        const next = `${candidate}_${suffix}`;
        if (!exists(next)) {
            return next;
        }
    }
}

/**
 * Why `output` is not allowed, or undefined when it is fine. It must not be a
 * dataset folder, inside one, or a folder that contains one.
 */
export function checkOutputLocation(
    output: string,
    datasetFolders: readonly string[],
    platform: NodeJS.Platform = process.platform
): string | undefined {
    for (const dataset of datasetFolders) {
        if (isSameOrInside(output, dataset, platform)) {
            return `The output folder must not be inside the dataset folder (${dataset}). `
                + 'Pick a location next to it or elsewhere.';
        }
        if (isSameOrInside(dataset, output, platform)) {
            return `The output folder would contain the dataset folder (${dataset}). Pick a different location.`;
        }
    }
    return undefined;
}

/**
 * `p` with links resolved where it exists; for a path that does not exist yet,
 * its nearest existing parent resolved plus the missing tail. This catches an
 * output that is inside the dataset only through a junction or symlink.
 */
export function canonicalPath(
    p: string,
    realpath: (p: string) => string | undefined,
    platform: NodeJS.Platform = process.platform
): string {
    const api = pathApi(platform);
    const resolved = api.resolve(p);
    const real = realpath(resolved);
    if (real !== undefined) {
        return real;
    }
    const parent = api.dirname(resolved);
    if (parent === resolved) {
        return resolved;
    }
    return api.join(canonicalPath(parent, realpath, platform), api.basename(resolved));
}
