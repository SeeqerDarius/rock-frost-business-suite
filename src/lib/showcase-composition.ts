import type { CustomerShowcaseItem } from "@/components/marketing/customer-showcase";
import { DEMO_SHOWCASE_CUSTOMERS, DEMO_SHOWCASE_ENABLED, MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL } from "@/lib/demo-showcase-customers";

export const SHOWCASE_CAP = 12;

export interface ShowcaseComposition {
  customers: CustomerShowcaseItem[];
  hasDemoEntries: boolean;
}

/**
 * Real, approved entries (on-platform tenants and independent customers —
 * both already filtered/authorized by the caller) always come first and
 * are never displaced or hidden. Fictional demonstration entries from
 * `src/lib/demo-showcase-customers.ts` only supplement the list when there
 * are too few real ones for the section to look intentional, and only up
 * to the pre-existing 12-item homepage cap.
 *
 * A pure function (no I/O) specifically so it can be unit-tested without
 * mocking the database or a session — see
 * `test/showcase-composition.test.ts`.
 */
export function buildShowcaseCustomers(realCustomers: CustomerShowcaseItem[]): ShowcaseComposition {
  if (!DEMO_SHOWCASE_ENABLED || realCustomers.length >= MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL) {
    return { customers: realCustomers.slice(0, SHOWCASE_CAP), hasDemoEntries: false };
  }

  const needed = Math.min(
    MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL - realCustomers.length,
    SHOWCASE_CAP - realCustomers.length,
  );
  const demoFill: CustomerShowcaseItem[] = DEMO_SHOWCASE_CUSTOMERS.slice(0, Math.max(needed, 0)).map((demo) => ({
    id: demo.id,
    name: demo.name,
    industry: demo.industry,
    logoUrl: demo.logoUrl,
    quote: demo.quote,
    attribution: demo.attribution,
    isDemo: true,
  }));

  return {
    customers: [...realCustomers, ...demoFill].slice(0, SHOWCASE_CAP),
    hasDemoEntries: demoFill.length > 0,
  };
}
