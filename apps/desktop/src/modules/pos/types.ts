/** See fleet/types.ts's file-level note — draft shapes, not a confirmed server schema. */

export interface PosOfflineSaleLine {
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
}

/** Financial. */
export interface PosOfflineSalePayload {
  registerId: string;
  soldAt: string;
  lines: PosOfflineSaleLine[];
  totalAmount: string;
  currency: string;
  paymentMethod: "cash" | "card" | "mobile_money";
  cashierName: string;
}

/** Financial. */
export interface PosOfflineReceiptPayload {
  saleId: string;
  issuedAt: string;
  receiptNumber: string;
}

export const POS_ENTITY_TYPES = {
  OFFLINE_SALE: "pos.offline_sale",
  OFFLINE_RECEIPT: "pos.offline_receipt",
} as const;
