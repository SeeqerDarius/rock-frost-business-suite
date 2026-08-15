import { describe, expect, it } from "vitest";
import { activationSchema, offlineMutationSchema, pushBatchSchema } from "@/lib/offline-sync/contract";

const mutation = {
  mutationId: "3b12f1df-5232-4804-897e-917bf397618a",
  organizationId: "org_1",
  moduleKey: "inventory",
  entityType: "inventory.movement",
  entityId: "local_movement_1",
  operation: "CREATE",
  baseVersion: 0,
  changedAt: "2026-08-15T00:00:00.000Z",
  payload: { itemId: "item_1", warehouseId: "warehouse_1", type: "RECEIPT", quantity: 2 },
};

describe("offline synchronization contract", () => {
  it("accepts a bounded append-only mutation", () => {
    expect(offlineMutationSchema.parse(mutation)).toMatchObject({ moduleKey: "inventory", baseVersion: 0 });
  });

  it("rejects cross-module entity declarations and unsupported mutation shapes at the contract boundary", () => {
    expect(offlineMutationSchema.safeParse({ ...mutation, entityType: "hospital.patient" }).success).toBe(false);
    expect(offlineMutationSchema.safeParse({ ...mutation, operation: "DELETE" }).success).toBe(false);
    expect(offlineMutationSchema.safeParse({ ...mutation, baseVersion: 2 }).success).toBe(false);
    expect(pushBatchSchema.safeParse({ mutations: Array.from({ length: 51 }, () => mutation) }).success).toBe(false);
  });

  it("requires a human-readable single-use activation code and supported desktop platform", () => {
    const valid = { activationCode: "ABCDE-23456", installationId: "device-installation-123", name: "Front Desk", platform: "windows", moduleKeys: ["pos"] };
    expect(activationSchema.safeParse(valid).success).toBe(true);
    expect(activationSchema.safeParse({ ...valid, activationCode: "1234", platform: "android" }).success).toBe(false);
  });
});
