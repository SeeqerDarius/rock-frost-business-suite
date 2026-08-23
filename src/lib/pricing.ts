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
  { moduleKey: "inventory", monthlyGhs: 799, annualGhs: 7990, includedSeats: 12, additionalSeatGhs: 35 },
  { moduleKey: "accounting", monthlyGhs: 699, annualGhs: 6990, includedSeats: 8, additionalSeatGhs: 35 },
  { moduleKey: "hr", monthlyGhs: 549, annualGhs: 5490, includedSeats: 15, additionalSeatGhs: 25 },
  { moduleKey: "projects", monthlyGhs: 249, annualGhs: 2490, includedSeats: 10, additionalSeatGhs: 25 },
  { moduleKey: "pos", monthlyGhs: 599, annualGhs: 5990, includedSeats: 8, additionalSeatGhs: 35 },
  { moduleKey: "analytics", monthlyGhs: 199, annualGhs: 1990, includedSeats: 5, additionalSeatGhs: 25 },
  { moduleKey: "fleet", monthlyGhs: 499, annualGhs: 4990, includedSeats: 10, additionalSeatGhs: 30 },
  { moduleKey: "installment", monthlyGhs: 599, annualGhs: 5990, includedSeats: 10, additionalSeatGhs: 30 },
  { moduleKey: "hotel", monthlyGhs: 799, annualGhs: 7990, includedSeats: 15, additionalSeatGhs: 40 },
  { moduleKey: "school", monthlyGhs: 599, annualGhs: 5990, includedSeats: 20, additionalSeatGhs: 30 },
  { moduleKey: "hostel", monthlyGhs: 449, annualGhs: 4490, includedSeats: 8, additionalSeatGhs: 25 },
  { moduleKey: "pharmacy", monthlyGhs: 999, annualGhs: 9990, includedSeats: 15, additionalSeatGhs: 45 },
  { moduleKey: "hospital", monthlyGhs: 2499, annualGhs: 24990, includedSeats: 30, additionalSeatGhs: 60 },
] as const;

export const MODULE_PRICE_BY_KEY = new Map(MODULE_PRICES.map((price) => [price.moduleKey, price]));

export const PRICING_BUNDLES = [
  { key: "business-starter", name: "Business Starter", monthlyGhs: 1499, moduleKeys: ["crm", "inventory", "accounting"], modules: ["CRM", "Inventory & Procurement", "Accounting"] },
  { key: "retail-suite", name: "Retail Suite", monthlyGhs: 1999, moduleKeys: ["pos", "inventory", "accounting", "crm"], modules: ["POS", "Inventory & Procurement", "Accounting", "CRM"] },
  { key: "operations-suite", name: "Operations Suite", monthlyGhs: 1999, moduleKeys: ["hr", "inventory", "projects"], modules: ["Human Resources & Payroll", "Inventory & Procurement", "Projects"] },
  { key: "business-complete", name: "Business Complete", monthlyGhs: 3299, moduleKeys: ["crm", "inventory", "accounting", "hr", "projects", "analytics"], modules: ["CRM", "Inventory & Procurement", "Accounting", "Human Resources & Payroll", "Projects", "Analytics"] },
  { key: "school-complete", name: "School Complete", monthlyGhs: 2999, moduleKeys: ["school", "accounting", "hr", "inventory"], modules: ["School", "Accounting", "Human Resources & Payroll", "Inventory & Procurement"] },
  { key: "school-hostel-complete", name: "School & Hostel Complete", monthlyGhs: 3299, moduleKeys: ["school", "hostel", "accounting", "hr"], modules: ["School", "Hostel", "Accounting", "Human Resources & Payroll"] },
  { key: "pharmacy-complete", name: "Pharmacy Complete", monthlyGhs: 2699, moduleKeys: ["pharmacy", "inventory", "pos", "accounting"], modules: ["Pharmacy", "Inventory & Procurement", "POS", "Accounting"] },
  { key: "hospital-complete", name: "Hospital Complete", monthlyGhs: 4799, moduleKeys: ["hospital", "pharmacy", "inventory", "accounting", "hr"], modules: ["Hospital", "Pharmacy", "Inventory & Procurement", "Accounting", "Human Resources & Payroll"] },
] as const;

export type PricingBundleKey = (typeof PRICING_BUNDLES)[number]["key"];
export const PRICING_BUNDLE_BY_KEY = new Map(PRICING_BUNDLES.map((bundle) => [bundle.key, bundle]));

export function recommendedSubscriptionQuote(moduleKey: string, durationMonths: number) {
  const price = MODULE_PRICE_BY_KEY.get(moduleKey as BusinessModuleKey);
  if (!price) return null;
  if (durationMonths === 12) return { amountGhs: price.annualGhs, seatLimit: price.includedSeats };
  return { amountGhs: price.monthlyGhs * durationMonths, seatLimit: price.includedSeats };
}

export function formatGhs(amount: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(amount);
}
