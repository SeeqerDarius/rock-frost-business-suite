import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("organization-scope payments and reconciliation page (Phase B2)", () => {
  const actions = read("src/app/app/(overview)/organization/payments/actions.ts");
  const page = read("src/app/app/(overview)/organization/payments/page.tsx");
  const fleetPaymentsPage = read("src/app/app/fleet/payments/page.tsx");

  it("re-checks ORG_SETTINGS_MANAGE inside the retry Server Action, never trusting the page-level guard alone", () => {
    expect(actions).toContain('"use server"');
    expect(actions).toContain("hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)");
    expect(actions).toContain("retryOperationalPaymentReconciliation(tenant.organizationId, paymentId, tenant.userId)");
  });

  it("gates the page itself on the same permission as the retry action", () => {
    expect(page).toContain("hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)");
  });

  it("only offers a Retry control for a payment stuck at NEEDS_RETRY, never for a completed or still-pending one", () => {
    const block = page.slice(page.indexOf("payments.map"));
    expect(block).toContain('item.reconciliationStatus === "NEEDS_RETRY"');
  });

  it("derives the module-support matrix from the single MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT constant, not a second hardcoded list, and marks unsupported modules honestly", () => {
    expect(page).toContain("MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT");
    expect(page).toContain("module_.supported");
    expect(page).toContain("Not yet available");
  });

  it("reuses the already-generic listOperationalPayments() rather than a new Fleet-specific query", () => {
    expect(page).toContain("listOperationalPayments(tenant.organizationId)");
  });

  it("leaves Fleet's own reconciliation section untouched by this phase", () => {
    expect(fleetPaymentsPage).toContain("Online collection reconciliation");
    expect(fleetPaymentsPage).toContain("listOperationalPayments(tenant.organizationId)");
    expect(fleetPaymentsPage).not.toContain("retrySettlementReconciliation");
  });
});
