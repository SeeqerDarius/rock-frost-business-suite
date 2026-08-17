import "server-only";

/**
 * One row of a device's pulled offline snapshot. `version` is `0` for
 * models with no `updatedAt` column (read-only reference data whose
 * staleness the server re-validates on any subsequent mutation regardless);
 * otherwise it is `Math.floor(updatedAt.getTime())`, the same
 * timestamp-as-version scheme the adapter registry uses for optimistic-
 * concurrency UPDATE checks (see registry.ts). `payload` holds every field
 * except the ones already promoted to `entityId`/`version`.
 */
export interface OfflineSnapshotRow {
  entityType: string;
  entityId: string;
  version: number;
  payload: Record<string, unknown>;
}

export interface OfflineSnapshotBuilderResult {
  rows: OfflineSnapshotRow[];
  truncated: boolean;
}

export function versionOf(date: Date | null | undefined): number {
  return date ? Math.floor(date.getTime()) : 0;
}
