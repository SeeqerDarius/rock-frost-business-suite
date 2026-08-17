import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TenantContext } from "@/lib/tenant";
import type { OfflineMutationInput } from "@/lib/offline-sync/contract";

/**
 * Regression tests for the milestone 6 School offline adapters
 * (src/lib/offline-sync/modules/school.adapters.ts): the foundational
 * campus/academic-year/term slice. Permission gating per action and that
 * each action calls the exact same @/modules/school/service function the
 * web UI calls - exercised through the real dispatcher
 * (applyOfflineMutation), matching the established POS adapter test
 * convention (test/offline-pos-adapters.test.ts).
 */

const mockSchoolService = {
  createSchoolCampus: vi.fn(),
  createSchoolAcademicYear: vi.fn(),
  createSchoolTerm: vi.fn(),
};

vi.mock("@/modules/school/service", () => mockSchoolService);
// Only school.adapters.ts is under test; the other module adapter files
// import real service functions too, but applyOfflineMutation only loads
// what a given mutation's entityType actually resolves to, so no further
// mocking is needed here.

const { applyOfflineMutation, OfflineMutationDeniedError } = await import("@/lib/offline-sync/adapters");

function tenant(permissions: string[]): TenantContext {
  return { organizationId: "org-1", userId: "user-1", enabledModuleKeys: ["school"], permissions } as unknown as TenantContext;
}

function mutation(overrides: Partial<OfflineMutationInput> & { entityType: string }): OfflineMutationInput {
  return {
    mutationId: "6a3c1a3e-df1c-4b7e-9a3e-6f4f8c9d2b11",
    organizationId: "org-1",
    moduleKey: "school",
    entityId: "e1",
    operation: "CREATE",
    baseVersion: 0,
    changedAt: new Date("2026-08-17T00:00:00.000Z"),
    payload: {},
    ...overrides,
  } as OfflineMutationInput;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("school.campus", () => {
  it("requires school.campuses.manage and calls createSchoolCampus", async () => {
    mockSchoolService.createSchoolCampus.mockResolvedValue({ id: "c1", name: "Main Campus" });
    const result = await applyOfflineMutation(
      tenant(["school.campuses.manage"]),
      mutation({ entityType: "school.campus", payload: { code: "MAIN", name: "Main Campus" } }),
    );
    expect(mockSchoolService.createSchoolCampus).toHaveBeenCalledWith("org-1", { code: "MAIN", name: "Main Campus" });
    expect(result).toEqual({ id: "c1", name: "Main Campus" });
  });

  it("is denied without school.campuses.manage, and createSchoolCampus is never called", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.campus", payload: { code: "MAIN", name: "Main Campus" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
    expect(mockSchoolService.createSchoolCampus).not.toHaveBeenCalled();
  });

  it("rejects a payload missing required fields before calling the service", async () => {
    await expect(
      applyOfflineMutation(tenant(["school.campuses.manage"]), mutation({ entityType: "school.campus", payload: { code: "MAIN" } })),
    ).rejects.toMatchObject({ conflictType: "INVALID_PAYLOAD" });
    expect(mockSchoolService.createSchoolCampus).not.toHaveBeenCalled();
  });
});

describe("school.academic_year", () => {
  it("requires school.academics.manage and calls createSchoolAcademicYear", async () => {
    mockSchoolService.createSchoolAcademicYear.mockResolvedValue({ id: "y1", name: "2026/2027" });
    const result = await applyOfflineMutation(
      tenant(["school.academics.manage"]),
      mutation({ entityType: "school.academic_year", payload: { name: "2026/2027", startDate: "2026-09-01", endDate: "2027-07-31", current: true } }),
    );
    expect(mockSchoolService.createSchoolAcademicYear).toHaveBeenCalledWith("org-1", {
      name: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      current: true,
    });
    expect(result).toEqual({ id: "y1", name: "2026/2027" });
  });

  it("surfaces the service's own date-ordering rule as a conflict rather than a crash", async () => {
    class SchoolStateError extends Error {}
    mockSchoolService.createSchoolAcademicYear.mockRejectedValue(new SchoolStateError("Academic year end date must follow its start date."));
    await expect(
      applyOfflineMutation(
        tenant(["school.academics.manage"]),
        mutation({ entityType: "school.academic_year", payload: { name: "Bad Year", startDate: "2026-09-01", endDate: "2026-01-01" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.academics.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.academic_year", payload: { name: "2026/2027", startDate: "2026-09-01", endDate: "2027-07-31" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("school.term", () => {
  it("requires school.academics.manage and calls createSchoolTerm", async () => {
    mockSchoolService.createSchoolTerm.mockResolvedValue({ id: "t1", name: "Term 1" });
    const result = await applyOfflineMutation(
      tenant(["school.academics.manage"]),
      mutation({ entityType: "school.term", payload: { academicYearId: "y1", name: "Term 1", startDate: "2026-09-01", endDate: "2026-12-15" } }),
    );
    expect(mockSchoolService.createSchoolTerm).toHaveBeenCalledWith("org-1", {
      academicYearId: "y1",
      name: "Term 1",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
    });
    expect(result).toEqual({ id: "t1", name: "Term 1" });
  });

  it("surfaces a not-found academic year as a conflict rather than a crash", async () => {
    class SchoolNotFoundError extends Error {}
    mockSchoolService.createSchoolTerm.mockRejectedValue(new SchoolNotFoundError("Academic year not found."));
    await expect(
      applyOfflineMutation(
        tenant(["school.academics.manage"]),
        mutation({ entityType: "school.term", payload: { academicYearId: "missing", name: "Term 1", startDate: "2026-09-01", endDate: "2026-12-15" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without school.academics.manage", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "school.term", payload: { academicYearId: "y1", name: "Term 1", startDate: "2026-09-01", endDate: "2026-12-15" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});
