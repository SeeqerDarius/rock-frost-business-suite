import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createRegister,
  updateRegister,
  openSession,
  closeSession,
  createSale,
  refundSale,
  updateSettings,
  updateSaleNumberPrefix,
} from "@/modules/pos/service";
import { versionOf } from "@/lib/offline-sync/version";
import { defineOfflineAdapter } from "@/lib/offline-sync/registry";

const moneyAmountNonNegative = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Must be a non-negative number with at most 2 decimal places.");
const cuid = z.string().trim().min(1).max(50);

const posSaleSchema = z.object({
  sessionId: z.string().min(1).max(64),
  customerName: z.string().trim().max(200).nullable().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE_MONEY", "OTHER"]),
  lines: z.array(z.object({
    itemId: z.string().max(64).nullable().optional(),
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().positive(),
    unitPrice: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  })).min(1).max(100),
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  warehouseId: cuid.nullable().optional(),
  active: z.boolean().optional(),
});

const sessionOpenSchema = z.object({
  registerId: cuid,
  openingFloat: moneyAmountNonNegative,
});

const sessionCloseSchema = z.object({
  sessionId: cuid,
  closingCash: moneyAmountNonNegative,
});

const saleRefundSchema = z.object({
  saleId: cuid,
});

const receiptFooterSchema = z.object({
  receiptFooterText: z.string().trim().max(5000).nullable(),
});

const salePrefixSchema = z.object({
  saleNumberPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/),
});

/** organizationId already scopes both PosSettings and the pos OrganizationModule config uniquely; there is exactly one of each per org, so a fixed sentinel is the natural entityId rather than an arbitrary generated id. */
const SETTINGS_ENTITY_ID = "default";

export const posOfflineAdapters = [
  defineOfflineAdapter({
    entityType: "pos.sale",
    operation: "CREATE",
    payloadSchema: posSaleSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSale(tenant.organizationId, { ...payload, soldById: tenant.userId });
      return { id: record.id, saleNumber: record.saleNumber };
    },
  }),

  defineOfflineAdapter({
    entityType: "pos.register",
    operation: "CREATE",
    payloadSchema: registerSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_REGISTERS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createRegister(tenant.organizationId, payload);
      return { id: record.id, name: record.name };
    },
  }),
  defineOfflineAdapter({
    entityType: "pos.register",
    operation: "UPDATE",
    payloadSchema: registerSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_REGISTERS_MANAGE),
    loadCurrentVersion: async (tenant, entityId) => {
      const register = await db.posRegister.findFirst({ where: { id: entityId, organizationId: tenant.organizationId }, select: { updatedAt: true } });
      return register ? versionOf(register.updatedAt) : null;
    },
    apply: async (tenant, entityId, payload) => {
      const record = await updateRegister(tenant.organizationId, entityId, payload);
      return { id: record.id, name: record.name };
    },
  }),

  // Session open/close and refund are "events" (a client-generated
  // correlation entityId, the real target carried inside the payload),
  // not entity edits: there is no pre-existing local row to hold a
  // baseVersion against before the session/sale even has an id the
  // desktop knows about from a prior pull. Safety is the same server-side
  // re-validation every offline action already relies on - openSession's
  // one-open-session-per-register check, closeSession's status check, and
  // refundSale's atomic COMPLETED->REFUNDED claim - not a baseVersion.
  defineOfflineAdapter({
    entityType: "pos.session_open",
    operation: "CREATE",
    payloadSchema: sessionOpenSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_SESSIONS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await openSession(tenant.organizationId, { registerId: payload.registerId, openingFloat: payload.openingFloat, openedById: tenant.userId });
      return { id: record.id, status: record.status };
    },
  }),
  defineOfflineAdapter({
    entityType: "pos.session_close",
    operation: "CREATE",
    payloadSchema: sessionCloseSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_SESSIONS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await closeSession(tenant.organizationId, payload.sessionId, { closingCash: payload.closingCash, closedById: tenant.userId });
      return { id: record.id, status: record.status };
    },
  }),
  defineOfflineAdapter({
    entityType: "pos.sale_refund",
    operation: "CREATE",
    payloadSchema: saleRefundSchema,
    // Matches the web action's own permission exactly (refundExistingSale
    // in src/app/app/pos/sales/actions.ts): the same permission that
    // authorizes creating a sale also authorizes reversing one.
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await refundSale(tenant.organizationId, payload.saleId, tenant.userId);
      return { id: record.id, status: record.status };
    },
  }),

  defineOfflineAdapter({
    entityType: "pos.settings_receipt_footer",
    operation: "UPDATE",
    payloadSchema: receiptFooterSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_SETTINGS_MANAGE),
    loadCurrentVersion: async (tenant) => {
      const settings = await db.posSettings.findUnique({ where: { organizationId: tenant.organizationId }, select: { updatedAt: true } });
      // Missing means "never configured", not "deleted" - PosSettings is
      // get-or-create on first read (see getSettings in service.ts), so
      // this is a legitimate baseline, not a conflict-worthy absence.
      return settings ? versionOf(settings.updatedAt) : 0;
    },
    apply: async (tenant, _entityId, payload) => {
      const record = await updateSettings(tenant.organizationId, payload.receiptFooterText);
      return { receiptFooterText: record.receiptFooterText };
    },
  }),
  defineOfflineAdapter({
    entityType: "pos.settings_sale_prefix",
    operation: "UPDATE",
    payloadSchema: salePrefixSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_SETTINGS_MANAGE),
    loadCurrentVersion: async (tenant) => {
      // Sale number prefix has no dedicated column: it lives in the
      // generic OrganizationModule.configuration JSON store (see
      // getSaleNumberPrefix/updateSaleNumberPrefix in service.ts), so the
      // version comes from that assignment row's own updatedAt.
      const assignment = await db.organizationModule.findFirst({
        where: { organizationId: tenant.organizationId, module: { code: "pos" } },
        select: { updatedAt: true },
      });
      return assignment ? versionOf(assignment.updatedAt) : 0;
    },
    apply: async (tenant, _entityId, payload) => {
      await updateSaleNumberPrefix(tenant.organizationId, payload.saleNumberPrefix, tenant.userId);
      return { saleNumberPrefix: payload.saleNumberPrefix };
    },
  }),
];

/** Both settings entity types use this fixed entityId; exported so tests and any future caller stay in sync without duplicating the sentinel. */
export const POS_SETTINGS_ENTITY_ID = SETTINGS_ENTITY_ID;
