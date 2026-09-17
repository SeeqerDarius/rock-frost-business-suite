import { describe, expect, it } from "vitest";
import { isSchoolParentRole, isSchoolStudentRole, isNarrowSchoolPortalRole, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolNavigationForTenant, isRouteIncludedInPlan } from "@/modules/school/navigation-access";
import { featuresIncludedAt } from "@/platform/entitlements/catalogue";
import type { TenantContext } from "@/lib/tenant";

function buildTenant(overrides: Partial<TenantContext>): TenantContext {
  return {
    userId: "user-1",
    organizationId: "org-1",
    organization: { id: "org-1", name: "Test School", tenantCode: "TS", industry: null, status: "ACTIVE" },
    role: null,
    roleId: "role-1",
    roleIsSystem: true,
    roleOrganizationId: null,
    permissions: [],
    branch: null,
    enabledModuleKeys: ["school"],
    accessibleModuleKeys: ["school"],
    memberships: [],
    ...overrides,
  } as TenantContext;
}

describe("isSchoolParentRole / isSchoolStudentRole", () => {
  it("classifies the seeded Parent role as a narrow portal role", () => {
    const tenant = buildTenant({ role: "Parent", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(isSchoolParentRole(tenant)).toBe(true);
    expect(isSchoolStudentRole(tenant)).toBe(false);
    expect(isNarrowSchoolPortalRole(tenant)).toBe(true);
  });

  it("classifies the seeded Student role as a narrow portal role", () => {
    const tenant = buildTenant({ role: "Student", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(isSchoolStudentRole(tenant)).toBe(true);
    expect(isNarrowSchoolPortalRole(tenant)).toBe(true);
  });

  it("does not classify a custom role that happens to be named Parent (not seeded/system)", () => {
    const tenant = buildTenant({ role: "Parent", roleIsSystem: false, permissions: [PERMISSIONS.SCHOOL_PORTAL_VIEW] });
    expect(isSchoolParentRole(tenant)).toBe(false);
  });

  it("does not classify a School Administrator (broad SCHOOL_VIEW present) as a narrow portal role", () => {
    const tenant = buildTenant({ role: "Parent", permissions: [PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.SCHOOL_VIEW] });
    expect(isSchoolParentRole(tenant)).toBe(false);
  });

  it("is false for an unrelated role", () => {
    const tenant = buildTenant({ role: "Teacher", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE] });
    expect(isNarrowSchoolPortalRole(tenant)).toBe(false);
  });
});

describe("getSchoolNavigationForTenant", () => {
  // Navigation is now filtered by permission AND by the features the
  // organization's School plan includes, resolved from the catalogue's own
  // route declarations. These helpers name the plan rather than passing a
  // bare Set, so a reader can see which tier each case is about.
  const featuresAt = (tier: Parameters<typeof featuresIncludedAt>[1]) => new Set(featuresIncludedAt("school", tier));
  const PLATINUM = featuresAt("PLATINUM");
  const PRO = featuresAt("PRO");
  const BASIC = featuresAt("BASIC");

  it("shows a Parent/Student portal account only the My Portal link, and only when the plan includes the portal", () => {
    const tenant = buildTenant({ role: "Parent", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(getSchoolNavigationForTenant(tenant, PLATINUM).map((item) => item.href)).toEqual(["/app/school/portal"]);
    // Pro does not include the portal, so there is nothing this account can open.
    expect(getSchoolNavigationForTenant(tenant, PRO)).toEqual([]);
    expect(getSchoolNavigationForTenant(tenant, new Set())).toEqual([]);
  });

  it("never shows the portal link to staff without SCHOOL_PORTAL_VIEW", () => {
    const tenant = buildTenant({ role: "Teacher", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE, PERMISSIONS.SCHOOL_EXAMS_MANAGE] });
    const nav = getSchoolNavigationForTenant(tenant, PLATINUM);
    expect(nav.some((item) => item.href === "/app/school/portal")).toBe(false);
  });

  it("shows a School Administrator on Platinum the full staff navigation, including Portal Access", () => {
    const allSchoolPerms = Object.values(PERMISSIONS).filter((value) => value.startsWith("school."));
    const tenant = buildTenant({ role: "School Administrator", permissions: allSchoolPerms });
    const nav = getSchoolNavigationForTenant(tenant, PLATINUM);
    expect(nav.some((item) => item.href === "/app/school/portal-access")).toBe(true);
    expect(nav.some((item) => item.href === "/app/school/staff")).toBe(true);
  });

  it("hides the pages a lower plan does not include, from an administrator holding every permission", () => {
    // The point of gating core depth: permission is no longer sufficient.
    const allSchoolPerms = Object.values(PERMISSIONS).filter((value) => value.startsWith("school."));
    const tenant = buildTenant({ role: "School Administrator", permissions: allSchoolPerms });

    const basic = getSchoolNavigationForTenant(tenant, BASIC).map((item) => item.href);
    expect(basic).toContain("/app/school/students");
    expect(basic).toContain("/app/school/attendance");
    expect(basic).toContain("/app/school/staff");
    expect(basic).not.toContain("/app/school/fees");
    expect(basic).not.toContain("/app/school/exams");
    expect(basic).not.toContain("/app/school/portal-access");

    const pro = getSchoolNavigationForTenant(tenant, PRO).map((item) => item.href);
    expect(pro).toContain("/app/school/fees");
    expect(pro).toContain("/app/school/exams");
    expect(pro).toContain("/app/school/reports");
    expect(pro).not.toContain("/app/school/portal-access");
    expect(pro).not.toContain("/app/school/payroll");

    // Cumulative: every Basic page survives at Pro, every Pro page at Platinum.
    const platinum = getSchoolNavigationForTenant(tenant, PLATINUM).map((item) => item.href);
    expect(basic.every((href) => pro.includes(href))).toBe(true);
    expect(pro.every((href) => platinum.includes(href))).toBe(true);
  });

  it("leaves a route no feature claims gated only by permission", () => {
    // Campuses is deliberately not plan-gated as a route: the campus *count*
    // is the limit, so the page has to stay reachable to manage the one
    // campus a Basic plan allows.
    const tenant = buildTenant({ role: "School Administrator", permissions: [PERMISSIONS.SCHOOL_CAMPUSES_MANAGE] });
    expect(isRouteIncludedInPlan("/app/school/campuses", new Set())).toBe(true);
    expect(getSchoolNavigationForTenant(tenant, new Set()).map((item) => item.href)).toEqual(["/app/school/campuses"]);
  });
});
