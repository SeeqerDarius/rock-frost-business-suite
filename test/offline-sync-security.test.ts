import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

/** Per-module offline adapter files (src/lib/offline-sync/modules/*.adapters.ts) - the actual home of entity-type handlers since the adapters.ts registry refactor. Forbidden-string checks against adapters.ts alone would silently stop covering anything once code lives here instead. */
function offlineAdapterModuleSources(): { file: string; content: string }[] {
  const dir = path.join(root, "src/lib/offline-sync/modules");
  return fs.readdirSync(dir).map((file) => ({ file, content: source(path.join("src/lib/offline-sync/modules", file)) }));
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

  it("uses tenant idempotency and forbids high-risk mutation operations outside their explicitly approved module", () => {
    const schema = source("prisma/schema.prisma");
    const contract = source("src/lib/offline-sync/contract.ts");
    const adapters = source("src/lib/offline-sync/adapters.ts");
    const moduleAdapters = offlineAdapterModuleSources();
    expect(schema).toContain("@@unique([organizationId, mutationId])");
    // CREATE and UPDATE only - never widened to a bare z.string() or an
    // enum that could admit DELETE, which the offline contract has never
    // supported and this test exists specifically to keep it that way.
    expect(contract).toContain('operation: z.enum(["CREATE", "UPDATE"])');

    // refundSale is a deliberate, approved exception starting with the POS
    // offline-parity expansion (see OPERATOR_HANDOFF.md's milestone 4
    // entry): every action in POS, including refunds, is intentionally
    // offline-capable now, re-validated server-side at sync exactly like
    // every other offline mutation. It stays forbidden everywhere else -
    // this still catches an accidental refundSale import landing in
    // fleet/installment/inventory (or a future module not yet approved
    // for full parity), which would be the actual regression to prevent.
    for (const { file, content } of moduleAdapters) {
      if (file === "pos.adapters.ts") continue;
      expect(content).not.toContain("refundSale");
    }
    expect(adapters).not.toContain("refundSale");

    for (const forbidden of ["recordFleetWorkAndPayPayment", "HOSPITAL_", "PHARMACY_"]) {
      expect(adapters).not.toContain(forbidden);
      for (const { content } of moduleAdapters) expect(content).not.toContain(forbidden);
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
