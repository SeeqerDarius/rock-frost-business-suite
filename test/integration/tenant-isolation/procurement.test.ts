import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as procurement from "@/modules/procurement/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of the mocked IDOR coverage for
 * src/modules/procurement/service.ts. Every foreign-id validation here goes
 * through a direct organization-scoped findFirst on procurementVendor /
 * procurementRequest / procurementOrder, all of which throw the module's own
 * exported procurement.NotFoundError.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let orgBVendor: Awaited<ReturnType<typeof procurement.createVendor>>;
let orgAVendor: Awaited<ReturnType<typeof procurement.createVendor>>;
let orgBRequest: Awaited<ReturnType<typeof procurement.createRequest>>;
let orgBOrder: Awaited<ReturnType<typeof procurement.createOrder>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-procurement");
  orgB = await createTestOrg("orgB-procurement");

  orgBVendor = await procurement.createVendor(orgB.organizationId, { name: "Org B Vendor" });
  orgAVendor = await procurement.createVendor(orgA.organizationId, { name: "Org A Vendor" });
  orgBRequest = await procurement.createRequest(orgB.organizationId, { description: "Org B Request", quantity: 5 });
  orgBOrder = await procurement.createOrder(orgB.organizationId, {
    vendorId: orgBVendor.id,
    orderDate: new Date("2026-01-01"),
    lines: [{ description: "Widget", quantity: 5, unitCost: "1.00" }],
  });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Procurement service — cross-tenant isolation against real Postgres", () => {
  it("createOrder rejects a vendorId from another organization", async () => {
    await expect(
      procurement.createOrder(orgA.organizationId, {
        vendorId: orgBVendor.id,
        orderDate: new Date("2026-01-01"),
        lines: [{ description: "Should fail", quantity: 1, unitCost: "1.00" }],
      }),
    ).rejects.toThrow(procurement.NotFoundError);
  });

  it("createOrder rejects a requestId from another organization, even with Org A's own vendor", async () => {
    await expect(
      procurement.createOrder(orgA.organizationId, {
        vendorId: orgAVendor.id,
        requestId: orgBRequest.id,
        orderDate: new Date("2026-01-01"),
        lines: [{ description: "Should fail", quantity: 1, unitCost: "1.00" }],
      }),
    ).rejects.toThrow(procurement.NotFoundError);
  });

  it("receiveOrderLine rejects an orderId from another organization", async () => {
    await expect(
      procurement.receiveOrderLine(orgA.organizationId, {
        orderId: orgBOrder.id,
        lineId: "nonexistent-line",
        quantity: 1,
      }),
    ).rejects.toThrow(procurement.NotFoundError);
  });

  it("listVendors scoped to Org A never returns Org B's vendor", async () => {
    const list = await procurement.listVendors(orgA.organizationId);
    expect(list.map((v) => v.id)).not.toContain(orgBVendor.id);
    expect(list.map((v) => v.id)).toContain(orgAVendor.id);
  });
});
