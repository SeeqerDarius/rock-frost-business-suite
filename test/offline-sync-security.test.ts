import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

/** Per-module offline adapter files (src/lib/offline-sync/modules/*.adapters.ts) - the actual home of entity-type handlers since the adapters.ts registry refactor. Forbidden-string checks against adapters.ts alone would silently stop covering anything once code lives here instead. */
function offlineAdapterModuleSources(): string[] {
  const dir = path.join(root, "src/lib/offline-sync/modules");
  return fs.readdirSync(dir).map((file) => source(path.join("src/lib/offline-sync/modules", file)));
}

describe("offline synchronization security boundaries", () => {
  it("stores only token hashes and revalidates revoked devices, users, memberships, organizations, subscriptions, and permissions", () => {
    const auth = source("src/lib/offline-sync/auth.ts");
    expect(auth).toContain('createHash("sha256")');
    expect(auth).toContain('device.status !== "ACTIVE"');
    expect(auth).toContain('device.user.status !== "ACTIVE"');
    expect(auth).toContain('device.membership.status !== "ACTIVE"');
    expect(auth).toContain("controlledProducts");
    expect(auth).toContain("activeSubscriptions");
    expect(auth).toContain("rolePermissions");
    expect(auth).not.toContain("DATABASE_URL");
  });

  it("uses tenant idempotency and forbids high-risk mutation operations", () => {
    const schema = source("prisma/schema.prisma");
    const contract = source("src/lib/offline-sync/contract.ts");
    const adapters = source("src/lib/offline-sync/adapters.ts");
    const moduleAdapters = offlineAdapterModuleSources();
    expect(schema).toContain("@@unique([organizationId, mutationId])");
    expect(contract).toContain('operation: z.literal("CREATE")');
    for (const forbidden of ["refundSale", "recordFleetWorkAndPayPayment", "HOSPITAL_", "PHARMACY_"]) {
      expect(adapters).not.toContain(forbidden);
      for (const moduleSource of moduleAdapters) expect(moduleSource).not.toContain(forbidden);
    }
  });

  it("keeps desktop responses private and uncached", () => {
    for (const file of [
      "src/app/api/desktop/activate/route.ts",
      "src/app/api/desktop/sync/push/route.ts",
      "src/app/api/desktop/sync/pull/route.ts",
      "src/app/api/desktop/deactivate/route.ts",
    ]) {
      expect(source(file)).toContain('"Cache-Control": "private, no-store"');
    }
  });

  it("returns a resolvable server conflict identifier without enabling local overwrite", () => {
    const service = source("src/lib/offline-sync/service.ts");
    const resolutionRoute = source("src/app/api/desktop/sync/conflicts/[conflictId]/resolve/route.ts");
    expect(service).toContain("conflictId: conflictRecord.id");
    expect(service).toContain('allowedResolutions: ["KEEP_CLOUD"]');
    expect(resolutionRoute).toContain("conflictResolutionSchema.safeParse");
  });
});
