import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mocked-db unit tests for the fix closing the gap where assigning a
 * Driver-permission role to a member never created a matching FleetDriver
 * row: /app/fleet/drivers stayed empty and the person's own self-service
 * pages (which resolve "me" via FleetDriver.userId) had nothing to show.
 * See ensureFleetDriverForUser/backfillMissingFleetDrivers in
 * src/modules/fleet/service.ts.
 */

const mockDb = {
  fleetDriver: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  fleetOwner: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  organizationMember: { findMany: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const fleet = await import("@/modules/fleet/service");
const tx = mockDb as unknown as Parameters<typeof fleet.ensureFleetDriverForUser>[0];

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
  // vi.clearAllMocks() resets call history but not mockResolvedValue
  // implementations, so every mock a test doesn't explicitly configure must
  // still get a sane default here - otherwise a persistent mockResolvedValue
  // set by one test (e.g. the email-linking tests below) leaks into whichever
  // test runs next.
  mockDb.fleetDriver.findFirst.mockResolvedValue(null);
  mockDb.fleetOwner.findFirst.mockResolvedValue(null);
});

describe("ensureFleetDriverForUser", () => {
  it("creates a FleetDriver row from the user's name/email when none exists yet", async () => {
    mockDb.fleetDriver.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ name: "Ama Mensah", email: "ama@example.com" });
    mockDb.fleetDriver.create.mockResolvedValue({ id: "driver-1" });

    await fleet.ensureFleetDriverForUser(tx, ORG, "user-1");

    expect(mockDb.fleetDriver.create).toHaveBeenCalledWith({
      data: { organizationId: ORG, userId: "user-1", name: "Ama Mensah", email: "ama@example.com" },
    });
  });

  it("falls back to email as the name when the user has no display name set", async () => {
    mockDb.fleetDriver.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ name: null, email: "driver@example.com" });
    mockDb.fleetDriver.create.mockResolvedValue({ id: "driver-1" });

    await fleet.ensureFleetDriverForUser(tx, ORG, "user-1");

    expect(mockDb.fleetDriver.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "driver@example.com" }) }),
    );
  });

  it("is idempotent: does nothing when a FleetDriver row already links this user", async () => {
    mockDb.fleetDriver.findUnique.mockResolvedValue({ id: "driver-existing" });

    await fleet.ensureFleetDriverForUser(tx, ORG, "user-1");

    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
    expect(mockDb.fleetDriver.create).not.toHaveBeenCalled();
  });

  it("links a pre-existing unlinked driver row by email instead of creating a duplicate", async () => {
    // A manager can add a driver to the roster by name/email before that
    // person is ever invited to log in. Regression coverage: invite-then-
    // accept used to always create a second FleetDriver row instead of
    // recognizing the one already on the roster.
    mockDb.fleetDriver.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ name: "Kojo Driver", email: "kojo@example.com" });
    mockDb.fleetDriver.findFirst.mockResolvedValue({ id: "driver-manual" });
    mockDb.fleetDriver.update.mockResolvedValue({ id: "driver-manual", userId: "user-1" });

    await fleet.ensureFleetDriverForUser(tx, ORG, "user-1");

    expect(mockDb.fleetDriver.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG, userId: null, email: "kojo@example.com" },
    });
    expect(mockDb.fleetDriver.update).toHaveBeenCalledWith({
      where: { id: "driver-manual" },
      data: { userId: "user-1", status: "ACTIVE" },
    });
    expect(mockDb.fleetDriver.create).not.toHaveBeenCalled();
  });
});

describe("ensureFleetOwnerForUser", () => {
  it("creates the owner portal profile once when the Vehicle Owner role is assigned", async () => {
    mockDb.fleetOwner.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ name: "Akosua Owner", email: "owner@example.com" });
    mockDb.fleetOwner.create.mockResolvedValue({ id: "owner-1" });

    await fleet.ensureFleetOwnerForUser(tx, ORG, "user-owner");

    expect(mockDb.fleetOwner.create).toHaveBeenCalledWith({
      data: { organizationId: ORG, userId: "user-owner", name: "Akosua Owner", email: "owner@example.com" },
    });
  });

  it("does not duplicate an existing linked owner profile", async () => {
    mockDb.fleetOwner.findUnique.mockResolvedValue({ id: "owner-existing" });
    await fleet.ensureFleetOwnerForUser(tx, ORG, "user-owner");
    expect(mockDb.fleetOwner.create).not.toHaveBeenCalled();
  });

  it("links a pre-existing unlinked owner row by email instead of creating a duplicate", async () => {
    mockDb.fleetOwner.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ name: "Akosua Owner", email: "owner@example.com" });
    mockDb.fleetOwner.findFirst.mockResolvedValue({ id: "owner-manual" });
    mockDb.fleetOwner.update.mockResolvedValue({ id: "owner-manual", userId: "user-owner" });

    await fleet.ensureFleetOwnerForUser(tx, ORG, "user-owner");

    expect(mockDb.fleetOwner.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG, userId: null, email: "owner@example.com" },
    });
    expect(mockDb.fleetOwner.update).toHaveBeenCalledWith({
      where: { id: "owner-manual" },
      data: { userId: "user-owner" },
    });
    expect(mockDb.fleetOwner.create).not.toHaveBeenCalled();
  });
});

describe("listAssignableDriverUsers / listAssignableOwnerUsers", () => {
  it("scopes the driver-login dropdown to members whose role grants driver self-service", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([]);
    await fleet.listAssignableDriverUsers(ORG);
    expect(mockDb.organizationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          status: "ACTIVE",
          role: { rolePermissions: { some: { permission: { key: "fleet.driver.self_service" } } } },
        }),
      }),
    );
  });

  it("scopes the owner-portal dropdown to members holding the Vehicle Owner role, not every active member", async () => {
    // Regression coverage: this dropdown previously listed every active
    // organization member (including, e.g., the Organization Owner), which
    // is how an unrelated person's name ended up selectable as a driver or
    // owner-portal login.
    mockDb.organizationMember.findMany.mockResolvedValue([]);
    await fleet.listAssignableOwnerUsers(ORG);
    expect(mockDb.organizationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG, status: "ACTIVE", role: { name: "Vehicle Owner" } }),
      }),
    );
  });
});

describe("listFleetDrivers backfill", () => {
  it("creates a FleetDriver for every active member whose role grants driver self-service and has no row yet", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([{ userId: "user-2" }, { userId: "user-3" }]);
    mockDb.fleetDriver.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique
      .mockResolvedValueOnce({ name: "Kwame Boateng", email: "kwame@example.com" })
      .mockResolvedValueOnce({ name: "Yaw Owusu", email: "yaw@example.com" });
    mockDb.fleetDriver.create.mockResolvedValue({ id: "new-driver" });

    await fleet.listFleetDrivers(ORG);

    expect(mockDb.organizationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          status: "ACTIVE",
          role: { rolePermissions: { some: { permission: { key: "fleet.driver.self_service" } } } },
          user: { fleetDriverProfiles: { none: { organizationId: ORG } } },
        }),
      }),
    );
    expect(mockDb.fleetDriver.create).toHaveBeenCalledTimes(2);
  });

  it("skips the backfill transaction entirely when nothing is missing", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([]);

    await fleet.listFleetDrivers(ORG);

    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
