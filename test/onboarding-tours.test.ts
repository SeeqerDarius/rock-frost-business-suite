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
  it("gives every nav item its own step, targeting that item's own sidebar link, so the tour teaches the whole module", () => {
    const steps = buildModuleTourSteps("Fleet Management", "Track vehicles and drivers.", [
      { label: "Vehicles", href: "/app/fleet/vehicles", icon: null, description: "Register and track every vehicle in your fleet." },
      { label: "Drivers", href: "/app/fleet/drivers", icon: null, description: "Add and manage driver profiles." },
    ]);
    expect(steps).toHaveLength(3); // welcome step + one per nav item
    expect(steps[0].title).toBe("Welcome to Fleet Management");
    expect(steps[0].content).toBe("Track vehicles and drivers.");
    expect(steps[1].target).toBe('[data-tour-nav="/app/fleet/vehicles"]');
    expect(steps[1].title).toBe("Vehicles");
    expect(steps[1].content).toBe("Register and track every vehicle in your fleet.");
    expect(steps[2].target).toBe('[data-tour-nav="/app/fleet/drivers"]');
    expect(steps[2].content).toBe("Add and manage driver profiles.");
  });

  it("still gives an item its own step, with a generic fallback, when that item has no description", () => {
    const steps = buildModuleTourSteps("Fleet Management", "Track vehicles and drivers.", [
      { label: "Vehicles", href: "/app/fleet/vehicles", icon: null },
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[1].content).toContain("Vehicles".toLowerCase());
  });

  it("falls back to a generic welcome when the module has no registry description, and adds no per-item steps for an empty navigation", () => {
    const steps = buildModuleTourSteps("Analytics", undefined, []);
    expect(steps[0].content).toContain("Analytics");
    expect(steps).toHaveLength(1);
  });
});

describe("every module's own navigation array carries a description on (almost) every item", () => {
  it("has real per-item tour content for every module, not just labels", () => {
    for (const module_ of catalogueModuleRegistry) {
      const withDescription = module_.navigation.filter((item) => item.description).length;
      expect(withDescription, `${module_.key} should have at least one nav item with a description`).toBeGreaterThan(0);
      // Every item should have one - flags a regression if a new nav item is added without one.
      const missing = module_.navigation.filter((item) => !item.description).map((item) => item.label);
      expect(missing, `${module_.key} is missing tour descriptions for: ${missing.join(", ")}`).toEqual([]);
    }
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
