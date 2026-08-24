import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("dashboard quick-launch grid", () => {
  it("shows a large tappable icon tile per enabled module as the first thing after sign-in", () => {
    const source = read("src/app/app/(overview)/dashboard/page.tsx");
    expect(source).toContain("Quick launch");
    expect(source).toContain("size-14 rounded-2xl");
    expect(source).toContain("accessibleModule.routePrefix");
  });

  it("drops the separate Modules sidebar tab now that Quick launch covers the same job", () => {
    const navigation = read("src/platform/modules/workspace-navigation.tsx");
    expect(navigation).not.toContain('label: "Modules"');
    expect(navigation).not.toContain('href: "/app/modules"');
    // The route itself must stay: module-access.ts and the zero-modules
    // empty state on Overview both still redirect/link there.
    const moduleAccess = read("src/lib/auth/module-access.ts");
    expect(moduleAccess).toContain("/app/modules");
    const dashboard = read("src/app/app/(overview)/dashboard/page.tsx");
    expect(dashboard).toContain('href="/app/modules"');
  });
});

describe("POS sell screen: tap-to-add product grid and keypad", () => {
  it("lets a cashier tap products into the cart instead of filling a row by hand", () => {
    const source = read("src/app/app/pos/sell/product-picker.tsx");
    expect(source).toContain("onAddItem(item)");
    expect(source).toContain("Search products");
    expect(source).toContain("New product");
  });

  it("drives quantity and price from an on-screen numeric keypad", () => {
    const source = read("src/app/app/pos/sell/sale-cart.tsx");
    expect(source).toContain("KEYPAD_KEYS");
    expect(source).toContain("function pressKey");
    expect(source).toContain('keypadMode === "qty"');
  });

  it("keeps the money keypad buffer valid for the server's two-decimal validator", () => {
    const source = read("src/app/app/pos/sell/sale-cart.tsx");
    expect(source).toContain("function sanitizeMoney");
    expect(source).toContain("function appendPriceDigit");
  });

  it("still submits the same line/payment contract the server validates", () => {
    const source = read("src/app/app/pos/sell/sale-cart.tsx");
    expect(source).toContain('name="lines"');
    expect(source).toContain('name="payments"');
    expect(source).toContain('name="mode"');
  });

  it("lets a cashier add a new product without leaving the register, gated on POS sale permission", () => {
    const source = read("src/app/app/pos/sell/actions.ts");
    expect(source).toContain("export async function createPosQuickItem");
    expect(source).toContain('requireModuleAccess("pos")');
    expect(source).toContain("PERMISSIONS.POS_SALES_MANAGE");
    expect(source).toContain("skuFromName");
  });

  it("does not redirect or revalidate the quick-add action, so the in-progress cart survives", () => {
    const source = read("src/app/app/pos/sell/actions.ts");
    const fnStart = source.indexOf("export async function createPosQuickItem");
    const fnBody = source.slice(fnStart);
    expect(fnBody).not.toContain("redirect(\"/app/pos/sell?saved=1\")");
    expect(fnBody).not.toContain("revalidatePath");
  });
});

describe("POS Sessions and Payments history, and the Orders rename", () => {
  it("adds a Sessions history page reusing the existing listSessions() query", () => {
    const service = read("src/modules/pos/service.ts");
    expect(service).toContain("export function listSessions");
    const page = read("src/app/app/pos/sessions/page.tsx");
    expect(page).toContain("listSessions");
    expect(page).toContain("PERMISSIONS.POS_REPORTS_VIEW");
  });

  it("adds a Payments list page backed by a new listPayments() query", () => {
    const service = read("src/modules/pos/service.ts");
    expect(service).toContain("export function listPayments");
    expect(service).toContain("db.posPayment.findMany");
    const page = read("src/app/app/pos/payments/page.tsx");
    expect(page).toContain("listPayments");
    expect(page).toContain("PERMISSIONS.POS_REPORTS_VIEW");
  });

  it("renames the Sales nav item to Orders and adds Sessions/Payments, without dropping the underlying route", () => {
    const navigation = read("src/modules/pos/navigation.tsx");
    expect(navigation).toContain('{ label: "Orders", href: "/app/pos/sales"');
    expect(navigation).toContain('{ label: "Sessions", href: "/app/pos/sessions"');
    expect(navigation).toContain('{ label: "Payments", href: "/app/pos/payments"');
  });
});
