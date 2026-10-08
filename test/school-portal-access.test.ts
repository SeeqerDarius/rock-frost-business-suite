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
  it("shows a Parent account only portal links, and only when the organization holds the portal entitlement", () => {
    const tenant = buildTenant({ role: "Parent", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(getSchoolNavigationForTenant(tenant, true).map((item) => item.href)).toEqual(["/app/school/portal", "/app/school/portal/announcements"]);
    // Portal messages also need the guardian messaging add-on.
    expect(getSchoolNavigationForTenant(tenant, true, true).map((item) => item.href)).toEqual(["/app/school/portal", "/app/school/portal/announcements", "/app/school/chats"]);
    expect(getSchoolNavigationForTenant(tenant, false, true)).toEqual([]);
    expect(getSchoolNavigationForTenant(tenant, false)).toEqual([]);
  });

  it("shows a Student portal account only My Portal, never guardian messaging or announcements", () => {
    const tenant = buildTenant({ role: "Student", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(getSchoolNavigationForTenant(tenant, true, true).map((item) => item.href)).toEqual(["/app/school/portal"]);
  });

  it("shows staff Chats with the messaging permission alone (staff chat needs no add-on), and Announcements to any School staff", () => {
    const teacher = buildTenant({ role: "Teacher", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_MESSAGES_MANAGE] });
    const viewer = buildTenant({ role: "School Viewer", permissions: [PERMISSIONS.SCHOOL_VIEW] });
    const hrefs = (tenant: TenantContext, portal: boolean, messaging: boolean) => getSchoolNavigationForTenant(tenant, portal, messaging).map((item) => item.href);
    expect(hrefs(teacher, true, true)).toContain("/app/school/chats");
    expect(hrefs(teacher, false, false)).toContain("/app/school/chats");
    expect(hrefs(viewer, true, true)).not.toContain("/app/school/chats");
    expect(hrefs(viewer, false, false)).toContain("/app/school/announcements");
    expect(hrefs(teacher, true, true)).not.toContain("/app/school/portal/announcements");
  });

  it("never shows the portal link to staff without SCHOOL_PORTAL_VIEW", () => {
    const tenant = buildTenant({ role: "Teacher", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE, PERMISSIONS.SCHOOL_EXAMS_MANAGE] });
    const nav = getSchoolNavigationForTenant(tenant, true);
    expect(nav.some((item) => item.href === "/app/school/portal")).toBe(false);
  });

  it("shows year rollover only to staff who can manage enrollment", () => {
    const manager = buildTenant({ role: "Enrollment Manager", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE] });
    const viewer = buildTenant({ role: "School Viewer", permissions: [PERMISSIONS.SCHOOL_VIEW] });
    expect(getSchoolNavigationForTenant(manager, false).some((item) => item.href === "/app/school/rollover")).toBe(true);
    expect(getSchoolNavigationForTenant(viewer, false).some((item) => item.href === "/app/school/rollover")).toBe(false);
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
