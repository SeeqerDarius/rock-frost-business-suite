export interface PosSaleLine extends Record<string, unknown> { itemId?: string | null; description: string; quantity: number; unitPrice: string }
export interface PosSalePayload extends Record<string, unknown> {
  sessionId: string; customerName?: string | null; paymentMethod: "CASH" | "CARD" | "MOBILE_MONEY" | "OTHER"; lines: PosSaleLine[];
}

export interface PosRegisterPayload extends Record<string, unknown> {
  name: string;
  warehouseId?: string | null;
  active?: boolean;
}

export interface PosSessionOpenPayload extends Record<string, unknown> {
  registerId: string;
  openingFloat: string;
}

export interface PosSessionClosePayload extends Record<string, unknown> {
  sessionId: string;
  closingCash: string;
}

export interface PosSaleRefundPayload extends Record<string, unknown> {
  saleId: string;
}

export interface PosReceiptFooterPayload extends Record<string, unknown> {
  receiptFooterText: string | null;
}

export interface PosSalePrefixPayload extends Record<string, unknown> {
  saleNumberPrefix: string;
}

/** Shape of a pulled `pos.register` row's payload (see buildPosSnapshot server-side). Mutation payloads for the same entityType (PosRegisterPayload) are a subset. */
export interface PosRegisterRecord extends Record<string, unknown> {
  name: string;
  warehouseId: string | null;
  active: boolean;
}

/** Shape of a pulled `pos.session` row's payload. Read-only: sessions are never pulled back as this exact shape after a local open/close, only as `pos.session_open`/`pos.session_close` mutation echoes until the next sync reconciles them. */
export interface PosSessionRecord extends Record<string, unknown> {
  registerId: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openingFloat: string;
  closingCash: string | null;
  closedAt: string | null;
  register: { name: string; warehouseId: string | null };
}

export interface PosSaleRecordLine extends Record<string, unknown> {
  id: string;
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

/** Shape of a pulled `pos.sale_record` row's payload. Deliberately distinct from PosSalePayload (the pos.sale mutation): this is the server's authoritative record of a completed sale, including its assigned saleNumber and status, not the client's request to create one. */
export interface PosSaleRecord extends Record<string, unknown> {
  registerId: string;
  sessionId: string;
  saleNumber: string;
  customerName: string | null;
  paymentMethod: "CASH" | "CARD" | "MOBILE_MONEY" | "OTHER";
  status: "COMPLETED" | "REFUNDED";
  subtotal: string;
  total: string;
  createdAt: string;
  lines: PosSaleRecordLine[];
}

/**
 * Shape of the single pulled `pos.settings` row's payload (entityId is
 * always POS_SETTINGS_ENTITY_ID). The row's own CachedRecord.version is the
 * receipt footer's baseVersion; saleNumberPrefixVersion is the prefix's own
 * independent baseVersion (it lives on a different server-side row - see
 * the comment in snapshot-builders/pos.ts). Never send the row's own
 * version as the prefix's baseVersion: they are not interchangeable.
 */
export interface PosSettingsRecord extends Record<string, unknown> {
  receiptFooterText: string | null;
  saleNumberPrefix: string;
  saleNumberPrefixVersion: number;
  canManageSettings: boolean;
}

export const POS_ENTITY_TYPES = {
  SALE: "pos.sale",
  REGISTER: "pos.register",
  SESSION_OPEN: "pos.session_open",
  SESSION_CLOSE: "pos.session_close",
  SALE_REFUND: "pos.sale_refund",
  SETTINGS_RECEIPT_FOOTER: "pos.settings_receipt_footer",
  SETTINGS_SALE_PREFIX: "pos.settings_sale_prefix",
  SESSION_RECORD: "pos.session",
  SALE_RECORD: "pos.sale_record",
  SETTINGS_RECORD: "pos.settings",
} as const;

/** Matches the server adapter's fixed sentinel (src/lib/offline-sync/modules/pos.adapters.ts): both settings entity types and the pulled pos.settings row all share this one entityId per organization. */
export const POS_SETTINGS_ENTITY_ID = "default";
