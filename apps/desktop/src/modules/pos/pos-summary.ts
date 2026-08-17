import type { PosRegisterRow, PosSaleRow, PosSessionRow } from "@/modules/pos/pos-data";

export interface PosSummary {
  registerCount: number;
  openSessionCount: number;
  todaySalesCount: number;
  todaySalesTotal: number;
  allTimeSalesCount: number;
  allTimeSalesTotal: number;
  refundedCount: number;
  byPaymentMethod: Record<string, { count: number; total: number }>;
}

/**
 * Derived entirely from what this device already has cached - there is no
 * separate offline "reports" endpoint. Both the Overview and Reports
 * screens read from this so the two never drift out of sync with each
 * other over what "today" or "all-time" means.
 */
export function computePosSummary(sales: PosSaleRow[], registers: PosRegisterRow[], sessions: PosSessionRow[]): PosSummary {
  const todayKey = new Date().toDateString();
  let todaySalesCount = 0;
  let todaySalesTotal = 0;
  let allTimeSalesCount = 0;
  let allTimeSalesTotal = 0;
  let refundedCount = 0;
  const byPaymentMethod: Record<string, { count: number; total: number }> = {};

  for (const sale of sales) {
    if (sale.data.status === "REFUNDED") {
      refundedCount += 1;
      continue;
    }
    const total = Number(sale.data.total) || 0;
    allTimeSalesCount += 1;
    allTimeSalesTotal += total;

    const bucket = byPaymentMethod[sale.data.paymentMethod] ?? { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += total;
    byPaymentMethod[sale.data.paymentMethod] = bucket;

    if (new Date(sale.data.createdAt).toDateString() === todayKey) {
      todaySalesCount += 1;
      todaySalesTotal += total;
    }
  }

  return {
    registerCount: registers.length,
    openSessionCount: sessions.filter((s) => s.data.status === "OPEN").length,
    todaySalesCount,
    todaySalesTotal,
    allTimeSalesCount,
    allTimeSalesTotal,
    refundedCount,
    byPaymentMethod,
  };
}
