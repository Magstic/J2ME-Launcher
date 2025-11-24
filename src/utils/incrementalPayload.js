// Utility helpers for handling games-incremental-update payloads
// Ensures new `{ added, updated, removed }` structure can co-exist with legacy formats.

const asArray = (value) => (Array.isArray(value) ? value : []);
const ensureString = (value) => (value == null ? null : String(value));
const isValidPatch = (patch) => patch && typeof patch === 'object' && ensureString(patch.filePath);

const filterPatches = (list) =>
  asArray(list)
    .map((item) => (isValidPatch(item) ? { ...item, filePath: ensureString(item.filePath) } : null))
    .filter(Boolean);

/**
 * Extracts an array of patch objects (added + updated) from any supported payload format.
 * Falls back to legacy array/object structures when needed.
 */
export function extractIncrementalPatches(payload) {
  if (!payload) return [];

  const collected = [];
  collected.push(...filterPatches(payload.added));
  collected.push(...filterPatches(payload.updated));
  return collected;
}

export function extractRemovedFilePaths(payload) {
  if (!payload) return [];
  return asArray(payload.removed).map(ensureString).filter(Boolean);
}

export function extractAffectedFilePaths(payload) {
  if (!payload) return [];

  const affected = new Set();
  if (Array.isArray(payload.affectedGames)) {
    for (const fp of payload.affectedGames) {
      const normalized = ensureString(fp);
      if (normalized) affected.add(normalized);
    }
  }

  extractRemovedFilePaths(payload).forEach((fp) => affected.add(fp));
  extractIncrementalPatches(payload)
    .map((patch) => patch.filePath)
    .filter(Boolean)
    .forEach((fp) => affected.add(fp));

  return Array.from(affected);
}
