import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOfflineAdapter, registerModuleAdapters, resolveHandler } from "@/lib/offline-sync/registry";
import { applyOfflineMutation, OfflineMutationDeniedError } from "@/lib/offline-sync/adapters";
import type { TenantContext } from "@/lib/tenant";
import type { OfflineMutationInput } from "@/lib/offline-sync/contract";

const fakeTenant = { organizationId: "org_1", userId: "user_1" } as unknown as TenantContext;

// These tests exercise applyOfflineMutation's dispatch/error-wrapping logic
// using registry-test-only entity types that deliberately fall outside the
// real contract's literal union (so the tests don't couple to real business
// modules). At runtime applyOfflineMutation only sees plain strings here -
// the zod contract validation that constrains those literals already ran
// upstream, before a mutation ever reaches this function - so the wider
// fixture type below is representative of what the function actually
// receives, not a type-safety hole in production code.
interface TestOfflineMutation {
  mutationId: string;
  organizationId: string;
  moduleKey: string;
  entityType: string;
  entityId: string;
  operation: "CREATE" | "UPDATE";
  baseVersion: number;
  changedAt: Date;
  payload: Record<string, unknown>;
}

function baseMutation(overrides: Partial<TestOfflineMutation> = {}): OfflineMutationInput {
  return {
    mutationId: "3b12f1df-5232-4804-897e-917bf397618a",
    organizationId: "org_1",
    moduleKey: "pos",
    entityType: "registry_test.widget",
    entityId: "w1",
    operation: "CREATE",
    baseVersion: 0,
    changedAt: new Date("2026-08-15T00:00:00.000Z"),
    payload: { label: "hello" },
    ...overrides,
  } as unknown as OfflineMutationInput;
}

describe("offline adapter registry", () => {
  it("resolves the exact (entityType, operation) pair and nothing else", () => {
    registerModuleAdapters([
      defineOfflineAdapter({
        entityType: "registry_test.pair_check",
        operation: "CREATE",
        payloadSchema: z.object({}),
        checkPermission: () => true,
        apply: async () => ({ ok: true }),
      }),
    ]);
    expect(resolveHandler("registry_test.pair_check", "CREATE")).toBeDefined();
    expect(resolveHandler("registry_test.pair_check", "UPDATE")).toBeUndefined();
    expect(resolveHandler("registry_test.nonexistent", "CREATE")).toBeUndefined();
  });

  it("dispatches to the registered handler's apply() with the parsed payload", async () => {
    registerModuleAdapters([
      defineOfflineAdapter({
        entityType: "registry_test.widget",
        operation: "CREATE",
        payloadSchema: z.object({ label: z.string() }),
        checkPermission: () => true,
        apply: async (_tenant, entityId, payload) => ({ entityId, label: payload.label }),
      }),
    ]);
    const result = await applyOfflineMutation(fakeTenant, baseMutation());
    expect(result).toEqual({ entityId: "w1", label: "hello" });
  });

  it("throws OfflineMutationDeniedError when checkPermission returns false, before the payload is even parsed", async () => {
    registerModuleAdapters([
      defineOfflineAdapter({
        entityType: "registry_test.denied",
        operation: "CREATE",
        payloadSchema: z.object({}),
        checkPermission: () => false,
        apply: async () => {
          throw new Error("apply must not run when permission is denied");
        },
      }),
    ]);
    await expect(applyOfflineMutation(fakeTenant, baseMutation({ entityType: "registry_test.denied" }))).rejects.toBeInstanceOf(
      OfflineMutationDeniedError,
    );
  });

  it("throws an INVALID_PAYLOAD conflict when the payload fails schema validation", async () => {
    registerModuleAdapters([
      defineOfflineAdapter({
        entityType: "registry_test.strict_payload",
        operation: "CREATE",
        payloadSchema: z.object({ count: z.number() }),
        checkPermission: () => true,
        apply: async () => ({ ok: true }),
      }),
    ]);
    await expect(
      applyOfflineMutation(fakeTenant, baseMutation({ entityType: "registry_test.strict_payload", payload: { count: "not a number" } })),
    ).rejects.toMatchObject({ conflictType: "INVALID_PAYLOAD" });
  });

  it("throws UNSUPPORTED_OPERATION for an entityType/operation pair with no registered handler", async () => {
    await expect(applyOfflineMutation(fakeTenant, baseMutation({ entityType: "registry_test.never_registered" }))).rejects.toMatchObject({
      conflictType: "UNSUPPORTED_OPERATION",
    });
  });

  it("wraps an unexpected error thrown from apply() as a SERVER_STATE_CHANGED conflict, not a raw crash", async () => {
    registerModuleAdapters([
      defineOfflineAdapter({
        entityType: "registry_test.throws",
        operation: "CREATE",
        payloadSchema: z.object({}),
        checkPermission: () => true,
        apply: async () => {
          throw new Error("simulated business-rule failure");
        },
      }),
    ]);
    await expect(applyOfflineMutation(fakeTenant, baseMutation({ entityType: "registry_test.throws" }))).rejects.toMatchObject({
      conflictType: "SERVER_STATE_CHANGED",
      message: "simulated business-rule failure",
    });
  });

  it("lets apply() throw OfflineMutationDeniedError directly for payload-dependent authorization failures", async () => {
    registerModuleAdapters([
      defineOfflineAdapter({
        entityType: "registry_test.fine_grained_denial",
        operation: "CREATE",
        payloadSchema: z.object({}),
        checkPermission: () => true,
        apply: async () => {
          throw new OfflineMutationDeniedError("no longer assigned");
        },
      }),
    ]);
    await expect(
      applyOfflineMutation(fakeTenant, baseMutation({ entityType: "registry_test.fine_grained_denial" })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });

  it("checks baseVersion against loadCurrentVersion for UPDATE operations and conflicts on staleness or deletion", async () => {
    registerModuleAdapters([
      defineOfflineAdapter({
        entityType: "registry_test.editable",
        operation: "UPDATE",
        payloadSchema: z.object({}),
        checkPermission: () => true,
        loadCurrentVersion: async (_tenant, entityId) => (entityId === "deleted" ? null : 100),
        apply: async () => ({ updated: true }),
      }),
    ]);
    await expect(
      applyOfflineMutation(fakeTenant, baseMutation({ entityType: "registry_test.editable", operation: "UPDATE", entityId: "e1", baseVersion: 99 })),
    ).rejects.toMatchObject({ conflictType: "STALE_VERSION" });
    await expect(
      applyOfflineMutation(fakeTenant, baseMutation({ entityType: "registry_test.editable", operation: "UPDATE", entityId: "deleted", baseVersion: 100 })),
    ).rejects.toMatchObject({ conflictType: "ENTITY_DELETED" });
    await expect(
      applyOfflineMutation(fakeTenant, baseMutation({ entityType: "registry_test.editable", operation: "UPDATE", entityId: "e1", baseVersion: 100 })),
    ).resolves.toEqual({ updated: true });
  });
});

describe("real module adapters stay registered exactly as before the registry refactor", () => {
  it("still resolves the original 5 entity-type/operation pairs", () => {
    expect(resolveHandler("fleet.maintenance_request", "CREATE")).toBeDefined();
    expect(resolveHandler("fleet.driver_payment_submission", "CREATE")).toBeDefined();
    expect(resolveHandler("installment.payment", "CREATE")).toBeDefined();
    expect(resolveHandler("inventory.movement", "CREATE")).toBeDefined();
    expect(resolveHandler("pos.sale", "CREATE")).toBeDefined();
  });
});
