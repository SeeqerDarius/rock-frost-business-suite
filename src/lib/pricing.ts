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
  { moduleKey: "inventory", monthlyGhs: 299, annualGhs: 2990, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "accounting", monthlyGhs: 349, annualGhs: 3490, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "hr", monthlyGhs: 299, annualGhs: 2990, includedSeats: 10, additionalSeatGhs: 25 },
  { moduleKey: "payroll", monthlyGhs: 349, annualGhs: 3490, includedSeats: 10, additionalSeatGhs: 25 },
  { moduleKey: "procurement", monthlyGhs: 299, annualGhs: 2990, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "projects", monthlyGhs: 249, annualGhs: 2490, includedSeats: 10, additionalSeatGhs: 25 },
  { moduleKey: "pos", monthlyGhs: 349, annualGhs: 3490, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "analytics", monthlyGhs: 199, annualGhs: 1990, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "fleet", monthlyGhs: 499, annualGhs: 4990, includedSeats: 10, additionalSeatGhs: 30 },
  { moduleKey: "installment", monthlyGhs: 599, annualGhs: 5990, includedSeats: 10, additionalSeatGhs: 30 },
  { moduleKey: "hotel", monthlyGhs: 799, annualGhs: 7990, includedSeats: 15, additionalSeatGhs: 40 },
  { moduleKey: "school", monthlyGhs: 599, annualGhs: 5990, includedSeats: 20, additionalSeatGhs: 30 },
  { moduleKey: "pharmacy", monthlyGhs: 699, annualGhs: 6990, includedSeats: 10, additionalSeatGhs: 40 },
  { moduleKey: "hospital", monthlyGhs: 1499, annualGhs: 14990, includedSeats: 20, additionalSeatGhs: 50 },
] as const;

export const MODULE_PRICE_BY_KEY = new Map(MODULE_PRICES.map((price) => [price.moduleKey, price]));

export const PRICING_BUNDLES = [
  { name: "Business Starter", monthlyGhs: 699, modules: ["CRM", "Inventory", "Accounting"] },
  { name: "Retail Suite", monthlyGhs: 999, modules: ["POS", "Inventory", "Accounting", "CRM"] },
  { name: "Operations Suite", monthlyGhs: 999, modules: ["HR", "Payroll", "Procurement", "Projects"] },
  { name: "Business Complete", monthlyGhs: 1799, modules: ["CRM", "Inventory", "Accounting", "HR", "Payroll", "Procurement", "Projects", "Analytics"] },
  { name: "School Complete", monthlyGhs: 1499, modules: ["School", "Accounting", "HR", "Payroll", "Inventory"] },
  { name: "Pharmacy Complete", monthlyGhs: 1599, modules: ["Pharmacy", "Inventory", "POS", "Accounting"] },
  { name: "Hospital Complete", monthlyGhs: 2999, modules: ["Hospital", "Pharmacy", "Inventory", "Accounting", "HR", "Payroll"] },
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
