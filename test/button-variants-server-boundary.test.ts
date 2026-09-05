import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression test for a live production crash: button.tsx became a "use
 * client" module (button-pending-state.test.ts), and every export of a
 * "use client" file - including a plain, non-component function like
 * buttonVariants() - becomes a client reference under React Server
 * Components. Any Server Component that imported buttonVariants from
 * button.tsx to build a className string for a plain <a>/<Link> (rather than
 * rendering <Button>) crashed with "buttonVariants is on the client" the
 * instant it rendered - this broke /app/accounting, four other accounting
 * pages, and, transitively through the two shared report-link components,
 * every module's Reports page. Fixed by moving buttonVariants into its own
 * non-"use client" module that both button.tsx and Server Components can
 * import directly.
 */
describe("buttonVariants is importable from Server Components", () => {
  const variantsFile = readFileSync("src/components/ui/button-variants.ts", "utf8");
  const buttonFile = readFileSync("src/components/ui/button.tsx", "utf8");

  it("button-variants.ts carries no client-boundary directive", () => {
    expect(variantsFile.trimStart().startsWith('"use client"')).toBe(false);
  });

  it("defines and exports buttonVariants", () => {
    expect(variantsFile).toContain("const buttonVariants = cva(");
    expect(variantsFile).toContain("export { buttonVariants }");
  });

  it("button.tsx (still \"use client\") now imports buttonVariants instead of defining it locally", () => {
    expect(buttonFile).toContain('"use client"');
    expect(buttonFile).toContain('import { buttonVariants } from "@/components/ui/button-variants"');
    expect(buttonFile).not.toContain("const buttonVariants = cva(");
  });

  const serverComponentConsumers = [
    "src/app/app/accounting/page.tsx",
    "src/app/app/accounting/invoices/page.tsx",
    "src/app/app/accounting/cashbook/page.tsx",
    "src/app/app/accounting/bills/page.tsx",
    "src/app/app/accounting/reconciliations/[reconciliationId]/page.tsx",
    "src/components/reports/report-export-links.tsx",
    "src/components/reports/report-download-links.tsx",
  ];

  it.each(serverComponentConsumers)("%s imports buttonVariants from the non-client module, not from button.tsx", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain('buttonVariants } from "@/components/ui/button"');
    expect(source).toContain('buttonVariants } from "@/components/ui/button-variants"');
  });
});
