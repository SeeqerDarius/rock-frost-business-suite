import "server-only";

import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSaleNumberPrefix } from "@/modules/pos/service";
import type { OfflineDeviceContext } from "@/lib/offline-sync/auth";
import { OFFLINE_SYNC_LIMITS } from "@/lib/offline-sync/contract";
import { versionOf, type OfflineSnapshotBuilderResult, type OfflineSnapshotRow } from "@/lib/offline-sync/snapshot-builders/types";

const RECENT_SESSIONS_TAKE = 200;
// Matches src/modules/pos/service.ts's listSales(), the same bound the web
// Sales History screen already uses - offline parity, not a new limit.
const RECENT_SALES_TAKE = 200;
const SETTINGS_ENTITY_ID = "default";

export async function buildPosSnapshot(context: OfflineDeviceContext): Promise<OfflineSnapshotBuilderResult> {
  const organizationId = context.device.organizationId;
  const take = OFFLINE_SYNC_LIMITS.snapshotRowsPerCollection;
  // Session visibility mirrors the web app: a POS_SESSIONS_MANAGE holder
  // sees every session (matching listSessions()), a sales-only user sees
  // only sessions they themselves opened, same as the narrower scope this
  // builder had before session/register history existed offline at all.
  const canManageSessions = hasPermission(context.tenant, PERMISSIONS.POS_SESSIONS_MANAGE);
  const canManageSettings = hasPermission(context.tenant, PERMISSIONS.POS_SETTINGS_MANAGE);

  const [registers, sessions, sales, settings, saleNumberPrefix, saleNumberPrefixAssignment] = await Promise.all([
    db.posRegister.findMany({
      where: { organizationId },
      select: { id: true, name: true, warehouseId: true, active: true, updatedAt: true },
      orderBy: { name: "asc" },
      take: take + 1,
    }),
    db.posSession.findMany({
      where: canManageSessions ? { organizationId } : { organizationId, openedById: context.device.userId },
      select: { id: true, registerId: true, status: true, openedAt: true, openingFloat: true, closingCash: true, closedAt: true, register: { select: { name: true, warehouseId: true } } },
      orderBy: { openedAt: "desc" },
      take: RECENT_SESSIONS_TAKE + 1,
    }),
    // Matches listSales()'s own scope exactly: organization-wide, not
    // restricted to the requesting user's own sales, for any device
    // authorized for POS at all - same as the web Sales History screen.
    db.posSale.findMany({
      where: { organizationId },
      select: {
        id: true, registerId: true, sessionId: true, saleNumber: true, customerName: true,
        paymentMethod: true, status: true, subtotal: true, total: true, createdAt: true,
        lines: { select: { id: true, itemId: true, description: true, quantity: true, unitPrice: true, lineTotal: true } },
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_SALES_TAKE + 1,
    }),
    db.posSettings.findUnique({ where: { organizationId }, select: { receiptFooterText: true, updatedAt: true } }),
    // Sale numbering prefix is settings-adjacent but readable by anyone
    // who can see it printed on a receipt; only gated for editing, not
    // viewing, so it is included regardless of canManageSettings.
    getSaleNumberPrefix(organizationId),
    // The prefix's own version, mirroring the adapter's loadCurrentVersion
    // for pos.settings_sale_prefix exactly (src/lib/offline-sync/modules/
    // pos.adapters.ts): it lives on the OrganizationModule assignment row,
    // not on PosSettings, so the single pos.settings row's own top-level
    // `version` (PosSettings.updatedAt) cannot double as this field's
    // baseVersion - a client that used it would send the wrong version
    // and fail every offline prefix edit as a false conflict.
    db.organizationModule.findFirst({ where: { organizationId, module: { code: "pos" } }, select: { updatedAt: true } }),
  ]);

  const truncated = registers.length > take || sessions.length > RECENT_SESSIONS_TAKE || sales.length > RECENT_SALES_TAKE;
  const rows: OfflineSnapshotRow[] = [];

  for (const { id, updatedAt, ...payload } of registers.slice(0, take)) {
    rows.push({ entityType: "pos.register", entityId: id, version: versionOf(updatedAt), payload });
  }
  for (const session of sessions.slice(0, RECENT_SESSIONS_TAKE)) {
    // PosSession has no updatedAt column: version 0, same convention as any other undated reference model.
    const { id, ...payload } = session;
    rows.push({ entityType: "pos.session", entityId: id, version: 0, payload });
  }
  for (const sale of sales.slice(0, RECENT_SALES_TAKE)) {
    // PosSale has no updatedAt column either: version 0.
    const { id, ...payload } = sale;
    rows.push({ entityType: "pos.sale_record", entityId: id, version: 0, payload });
  }
  rows.push({
    entityType: "pos.settings",
    entityId: SETTINGS_ENTITY_ID,
    // This row's own version is the receipt footer's baseVersion
    // (pos.settings_receipt_footer). The prefix's baseVersion travels as
    // its own payload field (saleNumberPrefixVersion) since it is versioned
    // independently server-side; see the comment above.
    version: settings ? versionOf(settings.updatedAt) : 0,
    payload: {
      receiptFooterText: settings?.receiptFooterText ?? null,
      saleNumberPrefix,
      saleNumberPrefixVersion: saleNumberPrefixAssignment ? versionOf(saleNumberPrefixAssignment.updatedAt) : 0,
      canManageSettings,
    },
  });

  return { rows, truncated };
}
