export const CURRENT_INDEX_CACHE_VERSION = 2;

export function isIndexCacheCompatible(
    payloadVersion: unknown,
    expectedVersion: number = CURRENT_INDEX_CACHE_VERSION
): boolean {
    return typeof payloadVersion === 'number' && payloadVersion === expectedVersion;
}
