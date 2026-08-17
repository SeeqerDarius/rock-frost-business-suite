import { useCallback, useEffect, useState } from "react";
import type { LocalDatabase } from "@/db/local-database";
import {
  POS_ENTITY_TYPES,
  type PosRegisterRecord,
  type PosSessionRecord,
  type PosSaleRecord,
  type PosSettingsRecord,
} from "@/modules/pos/types";

export interface PosRegisterRow { entityId: string; version: number; hasPendingLocalChange: boolean; data: PosRegisterRecord }
export interface PosSessionRow { entityId: string; hasPendingLocalChange: boolean; data: PosSessionRecord }
export interface PosSaleRow { entityId: string; hasPendingLocalChange: boolean; data: PosSaleRecord }
export interface PosSettingsRow { version: number; hasPendingLocalChange: boolean; data: PosSettingsRecord }

export interface PosSnapshot {
  registers: PosRegisterRow[];
  sessions: PosSessionRow[];
  sales: PosSaleRow[];
  settings: PosSettingsRow | null;
}

const EMPTY_SNAPSHOT: PosSnapshot = { registers: [], sessions: [], sales: [], settings: null };

/**
 * Reads every POS entity type this device has cached, shared by all 6 POS
 * screens so opening/closing a session or ringing a sale in one screen is
 * immediately reflected everywhere else without a manual refresh. Sorted
 * newest-first where the underlying data has a natural recency field, so a
 * just-recorded offline entry (still "Pending sync") is easy to find.
 */
export function usePosSnapshot(db: LocalDatabase) {
  const [snapshot, setSnapshot] = useState<PosSnapshot>(EMPTY_SNAPSHOT);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [registers, sessions, sales, settingsRows] = await Promise.all([
      db.listCachedRecords("pos", POS_ENTITY_TYPES.REGISTER),
      db.listCachedRecords("pos", POS_ENTITY_TYPES.SESSION_RECORD),
      db.listCachedRecords("pos", POS_ENTITY_TYPES.SALE_RECORD),
      db.listCachedRecords("pos", POS_ENTITY_TYPES.SETTINGS_RECORD),
    ]);

    setSnapshot({
      registers: registers
        .map((r) => ({ entityId: r.entityId, version: r.version, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as PosRegisterRecord }))
        .sort((a, b) => a.data.name.localeCompare(b.data.name)),
      sessions: sessions
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as PosSessionRecord }))
        .sort((a, b) => (a.data.openedAt < b.data.openedAt ? 1 : -1)),
      sales: sales
        .map((r) => ({ entityId: r.entityId, hasPendingLocalChange: r.hasPendingLocalChange, data: r.payload as PosSaleRecord }))
        .sort((a, b) => (a.data.createdAt < b.data.createdAt ? 1 : -1)),
      settings: settingsRows[0]
        ? { version: settingsRows[0].version, hasPendingLocalChange: settingsRows[0].hasPendingLocalChange, data: settingsRows[0].payload as PosSettingsRecord }
        : null,
    });
    setLoaded(true);
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, loaded, reload };
}
