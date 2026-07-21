import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as installment from "@/modules/installment/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of the mocked IDOR coverage for
 * src/modules/installment/service.ts (see
 * test/pass2-financial-inventory-integrity.test.ts for the mocked version).
 * Every foreign-id validation exercised here throws the module's own
 * exported installment.NotFoundError.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let productA: Awaited<ReturnType<typeof installment.createProduct>>;
let staffA: Awaited<ReturnType<typeof installment.createStaff>>;
let customerA: Awaited<ReturnType<typeof installment.createCustomer>>;

let productB: Awaited<ReturnType<typeof installment.createProduct>>;
let staffB: Awaited<ReturnType<typeof installment.createStaff>>;
let customerB: Awaited<ReturnType<typeof installment.createCustomer>>;

const PRODUCT_INPUT = {
  category: "General",
  costPrice: "50.00",
  transportCost: "5.00",
  dailyAmount: "5.00",
  duration: 20,
};

beforeAll(async () => {
  orgA = await createTestOrg("orgA-installment");
  orgB = await createTestOrg("orgB-installment");

  productA = await installment.createProduct(orgA.organizationId, { name: "Org A Product", ...PRODUCT_INPUT });
  staffA = await installment.createStaff(orgA.organizationId, { fullName: "Org A Staff", monthlySalary: "500.00" });
  customerA = await installment.createCustomer(orgA.organizationId, { fullName: "Org A Customer", staffId: staffA.id });

  productB = await installment.createProduct(orgB.organizationId, { name: "Org B Product", ...PRODUCT_INPUT });
  staffB = await installment.createStaff(orgB.organizationId, { fullName: "Org B Staff", monthlySalary: "500.00" });
  customerB = await installment.createCustomer(orgB.organizationId, { fullName: "Org B Customer", staffId: staffB.id });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Installment service — cross-tenant isolation against real Postgres", () => {
  it("createAccount rejects a productId from another organization", async () => {
    await expect(
      installment.createAccount(orgA.organizationId, {
        customerId: customerA.id,
        productId: productB.id,
        inventoryStaffId: staffA.id,
        startDate: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("createAccount rejects a customerId from another organization", async () => {
    await expect(
      installment.createAccount(orgA.organizationId, {
        customerId: customerB.id,
        productId: productA.id,
        inventoryStaffId: staffA.id,
        startDate: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("createAccount rejects an inventoryStaffId from another organization", async () => {
    await expect(
      installment.createAccount(orgA.organizationId, {
        customerId: customerA.id,
        productId: productA.id,
        inventoryStaffId: staffB.id,
        startDate: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("updateCustomer rejects a staffId from another organization", async () => {
    await expect(
      installment.updateCustomer(orgA.organizationId, customerA.id, {
        fullName: customerA.fullName,
        staffId: staffB.id,
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("recordStaffSalaryPayment rejects a staffId from another organization", async () => {
    await expect(
      installment.recordStaffSalaryPayment(orgA.organizationId, {
        staffId: staffB.id,
        amount: "100.00",
        paymentDate: new Date(),
        salaryMonth: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("adjustStaffInventory rejects a staffId from another organization", async () => {
    await expect(
      installment.adjustStaffInventory(orgA.organizationId, staffB.id, productA.id, 5),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("adjustStaffInventory rejects a productId from another organization", async () => {
    await expect(
      installment.adjustStaffInventory(orgA.organizationId, staffA.id, productB.id, 5),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("listCustomers scoped to Org A never returns Org B's customer", async () => {
    const list = await installment.listCustomers(orgA.organizationId, null);
    expect(list.map((c) => c.id)).not.toContain(customerB.id);
    expect(list.map((c) => c.id)).toContain(customerA.id);
  });

  it("listStaff scoped to Org A never returns Org B's staff", async () => {
    const list = await installment.listStaff(orgA.organizationId);
    expect(list.map((s) => s.id)).not.toContain(staffB.id);
    expect(list.map((s) => s.id)).toContain(staffA.id);
  });
});
