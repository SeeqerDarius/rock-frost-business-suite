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
  // Navigation is filtered by permission AND by the features the
  // organization's School plan includes, resolved from the catalogue's own
  // route declarations. These helpers name the plan rather than passing a
  // bare Set, so a reader can see which tier each case is about. The portal
  // and guardian messaging are ordinary features now, which is why the two
  // boolean parameters this function used to take are gone.
  const featuresAt = (tier: Parameters<typeof featuresIncludedAt>[1]) => new Set(featuresIncludedAt("school", tier));
  const PLATINUM = featuresAt("PLATINUM");
  const PRO = featuresAt("PRO");
  const BASIC = featuresAt("BASIC");
  // Platinum minus guardian messaging, for the cases that turn only it off.
  const PLATINUM_NO_MESSAGING = new Set([...PLATINUM].filter((key) => key !== "school.guardianMessaging"));
  const hrefs = (tenant: TenantContext, features: Set<string>) =>
    getSchoolNavigationForTenant(tenant, features).map((item) => item.href);

  it("shows a Parent account only portal links, and only when the plan includes the portal", () => {
    const tenant = buildTenant({ role: "Parent", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(hrefs(tenant, PLATINUM_NO_MESSAGING)).toEqual(["/app/school/portal", "/app/school/portal/announcements"]);
    // A guardian's Chats link needs guardian messaging on top of the portal.
    expect(hrefs(tenant, PLATINUM)).toEqual(["/app/school/portal", "/app/school/portal/announcements", "/app/school/chats"]);
    // Pro includes neither, so there is nothing this account can open.
    expect(hrefs(tenant, PRO)).toEqual([]);
    expect(hrefs(tenant, new Set())).toEqual([]);
  });

  it("never opens guardian messaging on messaging alone, without the portal it is read from", () => {
    const tenant = buildTenant({ role: "Parent", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(hrefs(tenant, new Set(["school.guardianMessaging"]))).toEqual([]);
  });

  it("shows a Student portal account only My Portal, never guardian messaging or announcements", () => {
    const tenant = buildTenant({ role: "Student", permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SCHOOL_PORTAL_VIEW, PERMISSIONS.AI_ASSISTANT_USE] });
    expect(hrefs(tenant, PLATINUM)).toEqual(["/app/school/portal"]);
  });

  it("keeps staff chat on every tier, since only guardian participation is the paid part", () => {
    const teacher = buildTenant({ role: "Teacher", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_MESSAGES_MANAGE] });
    const viewer = buildTenant({ role: "School Viewer", permissions: [PERMISSIONS.SCHOOL_VIEW] });
    expect(hrefs(teacher, PLATINUM)).toContain("/app/school/chats");
    // Basic too: gating the route would take staff chat from a plan that bought it.
    expect(hrefs(teacher, BASIC)).toContain("/app/school/chats");
    expect(hrefs(teacher, new Set())).toContain("/app/school/chats");
    expect(hrefs(viewer, PLATINUM)).not.toContain("/app/school/chats");
    expect(hrefs(viewer, new Set())).toContain("/app/school/announcements");
    expect(hrefs(teacher, PLATINUM)).not.toContain("/app/school/portal/announcements");
  });

  it("never shows the portal link to staff without SCHOOL_PORTAL_VIEW", () => {
    const tenant = buildTenant({ role: "Teacher", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE, PERMISSIONS.SCHOOL_EXAMS_MANAGE] });
    expect(hrefs(tenant, PLATINUM)).not.toContain("/app/school/portal");
  });

  it("shows year rollover only to staff who can manage enrollment, on any tier", () => {
    const manager = buildTenant({ role: "Enrollment Manager", permissions: [PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE] });
    const viewer = buildTenant({ role: "School Viewer", permissions: [PERMISSIONS.SCHOOL_VIEW] });
    expect(hrefs(manager, BASIC)).toContain("/app/school/rollover");
    expect(hrefs(viewer, BASIC)).not.toContain("/app/school/rollover");
  });

  it("shows a School Administrator on Platinum the full staff navigation, including Portal Access", () => {
    const allSchoolPerms = Object.values(PERMISSIONS).filter((value) => value.startsWith("school."));
    const tenant = buildTenant({ role: "School Administrator", permissions: allSchoolPerms });
    const nav = hrefs(tenant, PLATINUM);
    expect(nav).toContain("/app/school/portal-access");
    expect(nav).toContain("/app/school/staff");
  });

  it("hides the pages a lower plan does not include, from an administrator holding every permission", () => {
    // The point of gating core depth: permission is no longer sufficient.
    const allSchoolPerms = Object.values(PERMISSIONS).filter((value) => value.startsWith("school."));
    const tenant = buildTenant({ role: "School Administrator", permissions: allSchoolPerms });

    const basic = hrefs(tenant, BASIC);
    expect(basic).toContain("/app/school/students");
    expect(basic).toContain("/app/school/attendance");
    expect(basic).toContain("/app/school/staff");
    expect(basic).not.toContain("/app/school/fees");
    expect(basic).not.toContain("/app/school/exams");
    expect(basic).not.toContain("/app/school/portal-access");

    const pro = hrefs(tenant, PRO);
    expect(pro).toContain("/app/school/fees");
    expect(pro).toContain("/app/school/exams");
    expect(pro).toContain("/app/school/reports");
    expect(pro).not.toContain("/app/school/portal-access");
    expect(pro).not.toContain("/app/school/payroll");

    // Cumulative: every Basic page survives at Pro, every Pro page at Platinum.
    const platinum = hrefs(tenant, PLATINUM);
    expect(basic.every((href) => pro.includes(href))).toBe(true);
    expect(pro.every((href) => platinum.includes(href))).toBe(true);
  });

  it("leaves a route no feature claims gated only by permission", () => {
    // Campuses is deliberately not plan-gated as a route: the campus *count*
    // is the limit, so the page has to stay reachable to manage the one
    // campus a Basic plan allows.
    const tenant = buildTenant({ role: "School Administrator", permissions: [PERMISSIONS.SCHOOL_CAMPUSES_MANAGE] });
    expect(isRouteIncludedInPlan("/app/school/campuses", new Set())).toBe(true);
    expect(hrefs(tenant, new Set())).toEqual(["/app/school/campuses"]);
  });
});
