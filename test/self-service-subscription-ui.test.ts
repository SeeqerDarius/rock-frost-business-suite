import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("self-service subscription UI", () => {
  it("offers server-backed catalogue checkout from tenant Billing", () => {
    const page = read("src/app/app/(overview)/organization/billing/page.tsx");
    const actions = read("src/app/app/(overview)/organization/billing/actions.ts");
    expect(page).toContain("Add modules");
    expect(page).toContain("startSelfServiceCheckout");
    expect(actions).toContain("createSelfServiceSubscription");
    expect(actions).toContain('provider: "PAYSTACK"');
  });

  it("checks out a multi-module cart in a single payment instead of one per module", () => {
    const page = read("src/app/app/(overview)/organization/billing/page.tsx");
    const cart = read("src/app/app/(overview)/organization/billing/module-cart.tsx");
    const actions = read("src/app/app/(overview)/organization/billing/actions.ts");
    const service = read("src/platform/subscriptions/service.ts");
    expect(page).toContain("<ModuleCart");
    expect(cart).toContain('name="moduleKeys"');
    expect(cart).toContain("startCartCheckout");
    expect(actions).toContain("export async function startCartCheckout");
    expect(actions).toContain("formData.getAll(\"moduleKeys\")");
    expect(actions).toContain("createSelfServiceCartSubscription");
    expect(service).toContain("export async function createSelfServiceCartSubscription");
    expect(service).toContain("expandProductModuleKeys(uniqueKeys)");
  });

  it("sells a module with a plan ladder from its own card, never from the flat cart", () => {
    // The cart charges one price per module and has nowhere to choose a plan,
    // so a ladder module in it would hand over full access at whatever the
    // single headline price happens to be. Both halves are asserted: the cart
    // list excludes those modules, and the action refuses them even if a
    // crafted post puts one back.
    const page = read("src/app/app/(overview)/organization/billing/page.tsx");
    const actions = read("src/app/app/(overview)/organization/billing/actions.ts");
    expect(page).toContain("const cartProducts = selfServiceProducts.filter((price) => !ladderMap.has(price.moduleKey))");
    expect(page).toContain("Choose a plan");
    expect(page).toContain('name="tier"');
    expect(actions).toContain("moduleHasPublishedLadder");
    expect(actions).toContain("error=plan-required");
    expect(actions).toContain("error=plan-unavailable");
  });

  it("settles the plan on public signup before the organization is written", () => {
    // Public signup creates the organization, user, and membership before it
    // touches the subscription, so a plan refused at the service layer would
    // strand a workspace nobody can pay for. The guard has to run first.
    const source = read("src/app/(public)/subscribe/actions.ts");
    const body = source.slice(source.indexOf("export async function startPublicSubscription"));
    const guardAt = body.indexOf("getModuleTierPrice(");
    const orgWriteAt = body.indexOf("db.$transaction(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(orgWriteAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(orgWriteAt);
  });

  it("settles the plan on tenant checkout before a pending subscription exists", () => {
    // No organization is created here, but a refusal after the row is written
    // still leaves a PENDING_PAYMENT subscription with no way to pay it.
    const source = read("src/app/app/(overview)/organization/billing/actions.ts");
    const body = source.slice(source.indexOf("export async function startSelfServiceCheckout"));
    const guardAt = body.indexOf("getModuleTierPrice(");
    const createAt = body.indexOf("createSelfServiceSubscription(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(createAt);
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
