/** See fleet/types.ts's file-level note — draft shapes, not a confirmed server schema. */

/** Financial. */
export interface InstallmentCollectionEntryPayload {
  accountId: string;
  collectedAt: string;
  amount: string;
  currency: string;
  collectorName: string;
  location: string | null;
  notes: string | null;
}

/** Financial. */
export interface InstallmentPaymentReceiptPayload {
  accountId: string;
  paidAt: string;
  amount: string;
  currency: string;
  method: "cash" | "mobile_money" | "bank_transfer";
  reference: string | null;
  receiptNumber: string;
}

export const INSTALLMENT_ENTITY_TYPES = {
  COLLECTION_ENTRY: "installment.collection_entry",
  PAYMENT_RECEIPT: "installment.payment_receipt",
} as const;
