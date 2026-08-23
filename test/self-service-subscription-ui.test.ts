import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("self-service subscription UI", () => {
  it("offers server-backed catalogue checkout from tenant Billing", () => {
    const page = read("src/app/app/(overview)/organization/billing/page.tsx");
    const actions = read("src/app/app/(overview)/organization/billing/actions.ts");
    expect(page).toContain("Add a module");
    expect(page).toContain("startSelfServiceCheckout");
    expect(actions).toContain("createSelfServiceSubscription");
    expect(actions).toContain('provider: "PAYSTACK"');
  });

  it("renders a detailed verified thank-you page with a direct module launch", () => {
    const callback = read("src/app/app/(overview)/organization/billing/callback/paystack/page.tsx");
    expect(callback).toContain("Thank you for your payment");
    expect(callback).toContain("Payment summary");
    expect(callback).toContain("Payment reference");
    expect(callback).toContain("Open {details.moduleName}");
    expect(callback).toContain('verifyTransaction("PAYSTACK", ref)');
  });
});
