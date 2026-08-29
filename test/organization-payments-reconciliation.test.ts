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

describe("guided activation wizard (Phase B3)", () => {
  const actions = read("src/app/app/(overview)/organization/payments/actions.ts");
  const page = read("src/app/app/(overview)/organization/payments/page.tsx");
  const bankOptions = read("src/app/app/(overview)/organization/payments/bank-options.ts");
  const settingsPage = read("src/app/app/(overview)/organization/settings/page.tsx");
  const settingsActions = read("src/app/app/(overview)/organization/settings/actions.ts");
  const operational = read("src/lib/payments/operational.ts");

  it("never trusts a client-submitted bank name or a forged bank code - both are re-derived from the live bank list server-side", () => {
    const block = actions.slice(actions.indexOf("export async function submitSettlementAccount"), actions.indexOf("export async function confirmBeneficiaryTerms"));
    expect(block).toContain("(await loadBankOptions()).find((option) => option.code === bankCode)");
    expect(block).toContain("if (!bank) redirect(");
    expect(block).not.toContain('formData.get("bankName")');
  });

  it("previews the readiness checklist with commit: false, so simply viewing the step never writes to the database", () => {
    const block = page.slice(page.indexOf("async function ReadinessStep"));
    expect(block).toContain("commit: false");
  });

  it("keeps the real activation's not-ready redirect outside the try/catch, so a clean not-ready result is never misreported as a failed activation", () => {
    const block = actions.slice(actions.indexOf("export async function activateOnlineCollections"));
    const tryEnd = block.indexOf("}", block.indexOf("catch"));
    const redirectOutside = block.indexOf('redirect("/app/organization/payments?step=readiness&error=not-ready")', tryEnd);
    expect(redirectOutside).toBeGreaterThan(tryEnd);
  });

  it("only unlocks the Activate control once the readiness check reports READY", () => {
    const block = page.slice(page.indexOf("async function ReadinessStep"));
    expect(block).toContain('report.overall === "READY"');
    expect(block).toContain("activateOnlineCollections");
  });

  it("retires the old single-step settlement form and its action entirely, not just hides it", () => {
    expect(settingsPage).not.toContain("saveSettlementAccount");
    expect(settingsPage).not.toContain('name="bankCode"');
    expect(settingsActions).not.toContain("saveSettlementAccount");
    expect(operational).not.toContain("export async function saveSettlementProfile");
  });

  it("Workspace settings links out to the guided wizard instead of duplicating the form", () => {
    expect(settingsPage).toContain('href="/app/organization/payments"');
  });

  it("bank list loading degrades gracefully (empty list) rather than throwing when Paystack isn't configured", () => {
    expect(bankOptions).toContain('if (!isGatewayConfigured("PAYSTACK")) return [];');
    expect(bankOptions).toContain("catch (error)");
  });
});
