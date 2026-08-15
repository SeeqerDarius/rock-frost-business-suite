import { describe, expect, it } from "vitest";
import { MemoryLocalDatabase } from "@/db/memory-database";
import { InMemoryCredentialStore } from "@/security/credential-store";
import { DeviceLockController } from "@/security/device-lock";
import { handleRemoteRevocation } from "@/security/revocation";

describe("handleRemoteRevocation", () => {
  async function setUp() {
    const db = new MemoryLocalDatabase();
    const credentials = new InMemoryCredentialStore();
    const lockController = new DeviceLockController();

    const deviceId = "device-1";
    await db.saveDevice({
      deviceId,
      deviceName: "Test PC",
      organizationId: "org-1",
      userId: "user-1",
      userName: "Ama Owusu",
      enabledModuleKeys: ["fleet"],
      activatedAt: new Date().toISOString(),
      deactivatedAt: null,
      deactivationReason: null,
    });
    await db.upsertCachedRecord({
      moduleKey: "fleet",
      entityType: "fleet.trip",
      entityId: "trip-1",
      version: 1,
      payload: { note: "sensitive" },
      hasPendingLocalChange: false,
      updatedAt: new Date().toISOString(),
      updatedByUserId: null,
      updatedByUserName: null,
    });
    await credentials.set("accessToken", "secret-token");
    await credentials.set("refreshToken", "secret-refresh");

    return { db, credentials, lockController, deviceId };
  }

  it("locks the device immediately", async () => {
    const { db, credentials, lockController, deviceId } = await setUp();
    await handleRemoteRevocation({ db, credentials, lockController }, deviceId);
    expect(lockController.getState()).toMatchObject({ locked: true, reason: "revoked" });
  });

  it("purges every cached business record", async () => {
    const { db, credentials, lockController, deviceId } = await setUp();
    await handleRemoteRevocation({ db, credentials, lockController }, deviceId);
    const remaining = await db.listCachedRecords("fleet", "fleet.trip");
    expect(remaining).toHaveLength(0);
  });

  it("deletes every stored credential", async () => {
    const { db, credentials, lockController, deviceId } = await setUp();
    await handleRemoteRevocation({ db, credentials, lockController }, deviceId);
    expect(await credentials.get("accessToken")).toBeNull();
    expect(await credentials.get("refreshToken")).toBeNull();
  });

  it("marks the device row deactivated with reason revoked_by_server", async () => {
    const { db, credentials, lockController, deviceId } = await setUp();
    await handleRemoteRevocation({ db, credentials, lockController }, deviceId);
    const device = await db.getActiveDevice();
    expect(device?.deactivatedAt).not.toBeNull();
    expect(device?.deactivationReason).toBe("revoked_by_server");
  });

  it("records the full audit trail of what happened", async () => {
    const { db, credentials, lockController, deviceId } = await setUp();
    await handleRemoteRevocation({ db, credentials, lockController }, deviceId);
    const events = (await db.listAuditEvents()).map((e) => e.eventType);
    expect(events).toEqual(expect.arrayContaining(["revocation_received", "protected_data_purged", "device_locked"]));
  });
});
