export interface PosSaleLine extends Record<string, unknown> { itemId?: string | null; description: string; quantity: number; unitPrice: string }
export interface PosSalePayload extends Record<string, unknown> {
  sessionId: string; customerName?: string | null; paymentMethod: "CASH" | "CARD" | "MOBILE_MONEY" | "OTHER"; lines: PosSaleLine[];
}
export const POS_ENTITY_TYPES = { SALE: "pos.sale" } as const;
