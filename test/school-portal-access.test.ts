import { describe, expect, it } from "vitest";
import { isSchoolParentRole, isSchoolStudentRole, isNarrowSchoolPortalRole, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolNavigationForTenant } from "@/modules/school/navigation-access";
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
  it("shows a Parent/Student portal account only the My Portal link, and only when the organization holds the portal entitlement", () => {
    const tenant = buildTenant({ role: "Parent", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(getSchoolNavigationForTenant(tenant, true).map((item) => item.href)).toEqual(["/app/school/portal"]);
    expect(getSchoolNavigationForTenant(tenant, false)).toEqual([]);
  });

  it("never shows the portal link to staff without SCHOOL_PORTAL_VIEW", () => {
    const tenant = buildTenant({ role: "Teacher", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE, PERMISSIONS.SCHOOL_EXAMS_MANAGE] });
    const nav = getSchoolNavigationForTenant(tenant, true);
    expect(nav.some((item) => item.href === "/app/school/portal")).toBe(false);
  });

  it("shows a School Administrator the full staff navigation, including Portal Access, only when the organization holds the portal entitlement", () => {
    const allSchoolPerms = Object.values(PERMISSIONS).filter((value) => value.startsWith("school."));
    const tenant = buildTenant({ role: "School Administrator", permissions: allSchoolPerms });
    const grantedNav = getSchoolNavigationForTenant(tenant, true);
    expect(grantedNav.some((item) => item.href === "/app/school/portal-access")).toBe(true);
    expect(grantedNav.some((item) => item.href === "/app/school/staff")).toBe(true);
    const ungrantedNav = getSchoolNavigationForTenant(tenant, false);
    expect(ungrantedNav.some((item) => item.href === "/app/school/portal-access")).toBe(false);
    expect(ungrantedNav.some((item) => item.href === "/app/school/staff")).toBe(true);
  });
});
