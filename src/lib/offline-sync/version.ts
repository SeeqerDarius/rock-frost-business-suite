import "server-only";

/**
 * Shared timestamp-as-version scheme used both when building a pulled
 * snapshot row's `version` (snapshot-builders/*.ts) and when checking a
 * queued UPDATE mutation's `baseVersion` against the server's current
 * state (registry.ts, via a handler's `loadCurrentVersion`). A record's
 * version is its own `updatedAt` as epoch milliseconds; `0` for models or
 * rows with no meaningful `updatedAt` yet (never configured, or a model
 * with no `updatedAt` column at all) - that is not a client-trust gap,
 * since any mutation against such a record is still fully re-validated
 * server-side regardless of what version the client last saw.
 */
export function versionOf(date: Date | null | undefined): number {
  return date ? Math.floor(date.getTime()) : 0;
}
