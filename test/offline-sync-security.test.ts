import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

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
    expect(schema).toContain("@@unique([organizationId, mutationId])");
    expect(contract).toContain('operation: z.literal("CREATE")');
    expect(adapters).not.toContain("refundSale");
    expect(adapters).not.toContain("recordFleetWorkAndPayPayment");
    expect(adapters).not.toContain("HOSPITAL_");
    expect(adapters).not.toContain("PHARMACY_");
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
