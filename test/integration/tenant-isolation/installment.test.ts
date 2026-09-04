import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import * as installment from "@/modules/installment/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

const ORGANIZATION_SCOPE = { kind: "organization" } as const;

async function addMemberWithRole(org: TestOrg, roleName: string, label: string) {
  const runId = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await testDb.user.create({
    data: {
      name: `Integration Test User ${runId}`,
      email: `itest-${runId}@example.invalid`,
      passwordHash: await bcrypt.hash("not-a-real-password", 4),
      status: "ACTIVE",
    },
  });
  const role = await testDb.role.findFirst({ where: { organizationId: null, name: roleName } });
  if (!role) throw new Error(`"${roleName}" system role not found — ensurePlatformSeeded() should have created it.`);
  await testDb.organizationMember.create({
    data: { organizationId: org.organizationId, userId: user.id, roleId: role.id, status: "ACTIVE", joinedAt: new Date() },
  });
  return user;
}

/**
 * Real-Postgres equivalent of the mocked IDOR coverage for
 * src/modules/installment/service.ts (see
 * test/pass2-financial-inventory-integrity.test.ts for the mocked version).
 * Every foreign-id validation exercised here throws the module's own
 * exported installment.NotFoundError.
 */

let orgA: TestOrg;
let orgB: TestOrg;
const extraUserIds: string[] = [];

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
  staffA = await installment.createStaff(orgA.organizationId, { fullName: "Org A Staff", monthlySalary: "500.00", userId: null });
  customerA = await installment.createCustomer(orgA.organizationId, ORGANIZATION_SCOPE, { fullName: "Org A Customer", staffId: staffA.id });

  productB = await installment.createProduct(orgB.organizationId, { name: "Org B Product", ...PRODUCT_INPUT });
  staffB = await installment.createStaff(orgB.organizationId, { fullName: "Org B Staff", monthlySalary: "500.00", userId: null });
  customerB = await installment.createCustomer(orgB.organizationId, ORGANIZATION_SCOPE, { fullName: "Org B Customer", staffId: staffB.id });
});

afterAll(async () => {
  for (const userId of extraUserIds) await testDb.user.delete({ where: { id: userId } }).catch(() => {});
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Installment service — cross-tenant isolation against real Postgres", () => {
  it("createAccount rejects a productId from another organization", async () => {
    await expect(
      installment.createAccount(orgA.organizationId, ORGANIZATION_SCOPE, {
        customerId: customerA.id,
        productId: productB.id,
        inventoryStaffId: staffA.id,
        startDate: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("createAccount rejects a customerId from another organization", async () => {
    await expect(
      installment.createAccount(orgA.organizationId, ORGANIZATION_SCOPE, {
        customerId: customerB.id,
        productId: productA.id,
        inventoryStaffId: staffA.id,
        startDate: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("createAccount rejects an inventoryStaffId from another organization", async () => {
    await expect(
      installment.createAccount(orgA.organizationId, ORGANIZATION_SCOPE, {
        customerId: customerA.id,
        productId: productA.id,
        inventoryStaffId: staffB.id,
        startDate: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("updateCustomer rejects a staffId from another organization", async () => {
    await expect(
      installment.updateCustomer(orgA.organizationId, ORGANIZATION_SCOPE, customerA.id, {
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
    const list = await installment.listCustomers(orgA.organizationId, ORGANIZATION_SCOPE);
    expect(list.map((c) => c.id)).not.toContain(customerB.id);
    expect(list.map((c) => c.id)).toContain(customerA.id);
  });

  it("listStaff scoped to Org A never returns Org B's staff", async () => {
    const list = await installment.listStaff(orgA.organizationId);
    expect(list.map((s) => s.id)).not.toContain(staffB.id);
    expect(list.map((s) => s.id)).toContain(staffA.id);
  });

  it("offers only members with Installment access as linkable staff logins, not every active org member", async () => {
    const hirePurchaseStaff = await addMemberWithRole(orgA, "Hire Purchase Staff", "assignable-staff-login");
    const driver = await addMemberWithRole(orgA, "Driver", "assignable-driver");
    extraUserIds.push(hirePurchaseStaff.id, driver.id);

    const assignable = await installment.listAssignableStaffUsers(orgA.organizationId);
    const userIds = assignable.map((user) => user.id);

    expect(userIds).toContain(hirePurchaseStaff.id);
    expect(userIds).toContain(orgA.userId); // Organization Owner holds every permission, Installment included.
    expect(userIds).not.toContain(driver.id);
  });
});
