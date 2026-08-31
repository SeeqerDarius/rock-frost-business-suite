import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("shared operational payments architecture", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/payments/operational.ts");
  const gateway = read("src/lib/payments/paystack.ts");
  const webhook = read("src/app/api/payments/paystack/webhook/route.ts");

  it("separates operational payments from platform subscription payments", () => {
    expect(schema).toContain("model OperationalPayment");
    expect(schema).toContain("model SubscriptionPayment");
    expect(schema).toContain("enum OperationalPaymentPurpose");
  });

  it("stores masked settlement details and a provider reference, not a full account number", () => {
    const block = schema.slice(schema.indexOf("model SettlementProfile"), schema.indexOf("model OperationalPayment"));
    expect(block).toContain("accountLast4");
    expect(block).toContain("providerSubaccountCode");
    expect(block).not.toContain("accountNumber ");
  });

  it("derives fleet amount, organization, payer, and beneficiary on the server", () => {
    const initializeBlock = service.slice(service.indexOf("export async function initializeFleetOperationalPayment"), service.indexOf("export async function confirmOperationalPayment"));
    expect(service).toContain("assignedDriverId: driver.id");
    expect(service).toContain("amount = vehicle.salesTargetAmount");
    expect(service).toContain("beneficiaryReference: profile.providerSubaccountCode");
    expect(initializeBlock).not.toContain("input.amount");
  });

  it("routes tenant transactions with a Paystack subaccount", () => {
    expect(gateway).toContain("subaccount: input.subaccountCode");
    expect(service).toContain('paymentDomain: "TENANT_OPERATIONAL"');
  });

  it("uses signed webhook verification and a reserved operational reference namespace", () => {
    expect(webhook).toContain("verifyPaystackSignature(rawBody, signature)");
    expect(webhook).toContain('reference.startsWith("op_")');
    expect(service).toContain("pg_advisory_xact_lock");
  });

  it("posts Accounting only after provider confirmation and retains recovery state", () => {
    const confirmationBlock = service.slice(service.indexOf("export async function confirmOperationalPayment"));
    expect(confirmationBlock.indexOf("status: \"SUCCESS\"")).toBeLessThan(confirmationBlock.indexOf("reconcileOperationalPayment("));
    // postVerifiedFleetPaymentRevenue (src/modules/fleet/accounting.ts) is the
    // centralized wrapper every FLEET_PAYMENT/COLLECTED posting site now goes
    // through, including this one - see test/fleet-driver-sales-controls.test.ts
    // for the sibling assertions on the other 4 call sites it replaced.
    expect(service).toContain("await postVerifiedFleetPaymentRevenue");
    expect(service).toContain('reconciliationStatus: "NEEDS_RETRY"');
    expect(service).toContain('reconciliationStatus: accounting.posted');
  });

  it("retries reconciliation through the same shared helper the webhook path uses, never a duplicate implementation", () => {
    const reconcileBody = service.slice(service.indexOf("async function reconcileOperationalPayment"), service.indexOf("export async function confirmOperationalPayment"));
    expect(reconcileBody).toContain("await postVerifiedFleetPaymentRevenue");
    const retryBlock = service.slice(service.indexOf("export async function retryOperationalPaymentReconciliation"));
    expect(retryBlock).toContain("await reconcileOperationalPayment(payment)");
    expect(retryBlock).not.toContain("await postVerifiedFleetPaymentRevenue");
  });
});
