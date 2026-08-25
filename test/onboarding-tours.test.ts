import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildGeneralTourSteps, buildModuleTourSteps, GENERAL_TOUR_KEY } from "@/lib/tours/definitions";
import { catalogueModuleRegistry } from "@/platform/modules/registry";

describe("buildGeneralTourSteps", () => {
  it("includes a module-switcher step only when the shell actually shows one", () => {
    const withLauncher = buildGeneralTourSteps(true);
    const withoutLauncher = buildGeneralTourSteps(false);
    expect(withLauncher.some((step) => step.target === '[data-tour="module-switcher"]')).toBe(true);
    expect(withoutLauncher.some((step) => step.target === '[data-tour="module-switcher"]')).toBe(false);
  });

  it("always covers the shared chrome: logo, sidebar, and account menu", () => {
    const steps = buildGeneralTourSteps(true);
    expect(steps.some((step) => step.target === '[data-tour="home-logo"]')).toBe(true);
    expect(steps.some((step) => step.target === '[data-tour="sidebar-nav"]')).toBe(true);
    expect(steps.some((step) => step.target === '[data-tour="user-menu"]')).toBe(true);
  });
});

describe("buildModuleTourSteps", () => {
  it("derives its content from the module's own description and navigation, with no hand-authored copy", () => {
    const steps = buildModuleTourSteps("Fleet Management", "Track vehicles and drivers.", [
      { label: "Vehicles", href: "/app/fleet/vehicles", icon: null },
      { label: "Drivers", href: "/app/fleet/drivers", icon: null },
    ]);
    expect(steps[0].title).toBe("Welcome to Fleet Management");
    expect(steps[0].content).toBe("Track vehicles and drivers.");
    expect(steps[1].content).toContain("Vehicles");
    expect(steps[1].content).toContain("Drivers");
  });

  it("falls back to a generic welcome when the module has no registry description", () => {
    const steps = buildModuleTourSteps("Analytics", undefined, []);
    expect(steps[0].content).toContain("Analytics");
    expect(steps).toHaveLength(1);
  });
});

describe("every registered module has a wired-up moduleKey prop", () => {
  it("passes moduleKey to AppShell in its own layout.tsx, so new modules keep working without extra tour-content authoring", () => {
    for (const module_ of catalogueModuleRegistry) {
      const source = readFileSync(`src/app/app/${module_.key}/layout.tsx`, "utf8");
      expect(source, `${module_.key}/layout.tsx should pass moduleKey="${module_.key}" to AppShell`).toContain(`moduleKey="${module_.key}"`);
    }
  });
});

describe("Platform scope never renders tenant onboarding tours", () => {
  it("platform/layout.tsx does not pass an organization prop, which is what gates TourRunner", () => {
    const source = readFileSync("src/app/app/platform/layout.tsx", "utf8");
    expect(source).not.toContain("organization={{");
  });
});

const mockDb = { userTourProgress: { findMany: vi.fn(), upsert: vi.fn() } };
vi.mock("@/lib/db", () => ({ db: mockDb }));
const { listCompletedTourKeys, markTourCompleted } = await import("@/lib/tours/service");

describe("tours service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only this user's completed tour keys", async () => {
    mockDb.userTourProgress.findMany.mockResolvedValue([{ tourKey: "general" }, { tourKey: "fleet" }]);
    const keys = await listCompletedTourKeys("user-1");
    expect(keys).toEqual(["general", "fleet"]);
    expect(mockDb.userTourProgress.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
  });

  it("marks a tour completed idempotently, never erroring on a repeat call", async () => {
    await markTourCompleted("user-1", "fleet");
    expect(mockDb.userTourProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_tourKey: { userId: "user-1", tourKey: "fleet" } },
      update: {},
      create: { userId: "user-1", tourKey: "fleet" },
    }));
  });
});

const mockGetServerAuthSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mockGetServerAuthSession }));
const { getPendingTourKeys, completeTour } = await import("@/lib/tours/actions");

describe("tours actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.userTourProgress.findMany.mockResolvedValue([]);
  });

  it("returns every candidate key when nothing has been completed yet", async () => {
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mockDb.userTourProgress.findMany.mockResolvedValue([]);
    const pending = await getPendingTourKeys([GENERAL_TOUR_KEY, "fleet"]);
    expect(pending).toEqual([GENERAL_TOUR_KEY, "fleet"]);
  });

  it("filters out already-completed keys while preserving the given order", async () => {
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mockDb.userTourProgress.findMany.mockResolvedValue([{ tourKey: GENERAL_TOUR_KEY }]);
    const pending = await getPendingTourKeys([GENERAL_TOUR_KEY, "fleet"]);
    expect(pending).toEqual(["fleet"]);
  });

  it("returns nothing for an unauthenticated request rather than throwing", async () => {
    mockGetServerAuthSession.mockResolvedValue(null);
    const pending = await getPendingTourKeys([GENERAL_TOUR_KEY]);
    expect(pending).toEqual([]);
  });

  it("completeTour is a no-op without a session, and writes for a real one", async () => {
    mockGetServerAuthSession.mockResolvedValue(null);
    await completeTour("fleet");
    expect(mockDb.userTourProgress.upsert).not.toHaveBeenCalled();

    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    await completeTour("fleet");
    expect(mockDb.userTourProgress.upsert).toHaveBeenCalledTimes(1);
  });
});
