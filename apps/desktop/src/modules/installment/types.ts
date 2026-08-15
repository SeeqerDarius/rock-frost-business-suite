export interface InstallmentPaymentPayload extends Record<string, unknown> {
  accountId: string; amount: string; paymentDate: string; method: string; notes?: string | null;
}
export const INSTALLMENT_ENTITY_TYPES = { PAYMENT: "installment.payment" } as const;
