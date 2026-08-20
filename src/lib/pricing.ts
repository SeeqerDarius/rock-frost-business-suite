import type { BusinessModuleKey } from "@/platform/modules/registry";

export type ModulePrice = {
  moduleKey: BusinessModuleKey;
  monthlyGhs: number;
  annualGhs: number;
  includedSeats: number;
  additionalSeatGhs: number;
};

export const MODULE_PRICES: readonly ModulePrice[] = [
  { moduleKey: "crm", monthlyGhs: 249, annualGhs: 2490, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "inventory", monthlyGhs: 499, annualGhs: 4990, includedSeats: 8, additionalSeatGhs: 25 },
  { moduleKey: "accounting", monthlyGhs: 349, annualGhs: 3490, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "hr", monthlyGhs: 549, annualGhs: 5490, includedSeats: 15, additionalSeatGhs: 25 },
  { moduleKey: "projects", monthlyGhs: 249, annualGhs: 2490, includedSeats: 10, additionalSeatGhs: 25 },
  { moduleKey: "pos", monthlyGhs: 349, annualGhs: 3490, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "analytics", monthlyGhs: 199, annualGhs: 1990, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "fleet", monthlyGhs: 499, annualGhs: 4990, includedSeats: 10, additionalSeatGhs: 30 },
  { moduleKey: "installment", monthlyGhs: 599, annualGhs: 5990, includedSeats: 10, additionalSeatGhs: 30 },
  { moduleKey: "hotel", monthlyGhs: 799, annualGhs: 7990, includedSeats: 15, additionalSeatGhs: 40 },
  { moduleKey: "school", monthlyGhs: 599, annualGhs: 5990, includedSeats: 20, additionalSeatGhs: 30 },
  { moduleKey: "hostel", monthlyGhs: 449, annualGhs: 4490, includedSeats: 8, additionalSeatGhs: 25 },
  { moduleKey: "pharmacy", monthlyGhs: 699, annualGhs: 6990, includedSeats: 10, additionalSeatGhs: 40 },
  { moduleKey: "hospital", monthlyGhs: 1499, annualGhs: 14990, includedSeats: 20, additionalSeatGhs: 50 },
] as const;

export const MODULE_PRICE_BY_KEY = new Map(MODULE_PRICES.map((price) => [price.moduleKey, price]));

export const PRICING_BUNDLES = [
  { name: "Business Starter", monthlyGhs: 849, modules: ["CRM", "Inventory & Procurement", "Accounting"] },
  { name: "Retail Suite", monthlyGhs: 1199, modules: ["POS", "Inventory & Procurement", "Accounting", "CRM"] },
  { name: "Operations Suite", monthlyGhs: 1199, modules: ["Human Resources & Payroll", "Inventory & Procurement", "Projects"] },
  { name: "Business Complete", monthlyGhs: 1899, modules: ["CRM", "Inventory & Procurement", "Accounting", "Human Resources & Payroll", "Projects", "Analytics"] },
  { name: "School Complete", monthlyGhs: 1599, modules: ["School", "Accounting", "Human Resources & Payroll", "Inventory & Procurement"] },
  { name: "School & Hostel Complete", monthlyGhs: 1699, modules: ["School", "Hostel", "Accounting", "Human Resources & Payroll"] },
  { name: "Pharmacy Complete", monthlyGhs: 1799, modules: ["Pharmacy", "Inventory & Procurement", "POS", "Accounting"] },
  { name: "Hospital Complete", monthlyGhs: 3199, modules: ["Hospital", "Pharmacy", "Inventory & Procurement", "Accounting", "Human Resources & Payroll"] },
] as const;

export function recommendedSubscriptionQuote(moduleKey: string, durationMonths: number) {
  const price = MODULE_PRICE_BY_KEY.get(moduleKey as BusinessModuleKey);
  if (!price) return null;
  if (durationMonths === 12) return { amountGhs: price.annualGhs, seatLimit: price.includedSeats };
  return { amountGhs: price.monthlyGhs * durationMonths, seatLimit: price.includedSeats };
}

export function formatGhs(amount: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(amount);
}
