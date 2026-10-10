import type { TenantContext } from "@/lib/tenant";
import { hasPermission, isSchoolParentRole, isSchoolStudentRole, PERMISSIONS } from "@/lib/auth/permissions";
import type { ModuleNavItem } from "@/types/module";
import { schoolNavigation } from "@/modules/school/navigation";
import { moduleTierCatalogue } from "@/platform/entitlements/catalogue";

/**
 * The single source of truth for which School pages the current tenant can
 * open - School's own layout.tsx calls this to build the sidebar's page list,
 * mirroring src/modules/fleet/navigation-access.ts (see that file's comment
 * for why this stays a separate file from the plain schoolNavigation array).
 *
 * A page has to clear two independent gates:
 *
 * 1. **Permission**: does this user's role allow it. Unchanged.
 * 2. **Plan**: does the organization's School tier include the feature that
 *    owns the route. Read from the catalogue's own `routes` declarations
 *    rather than a second list here, so adding a feature to a tier cannot
 *    leave navigation behind. A route no feature claims is plan-free and
 *    only needs its permission.
 *
 * `entitledFeatures` replaced the booleans this used to take. It carries the
 * same answers (the portal and guardian messaging are features like any
 * other) plus every other feature a tier decides, and it already folds in
 * the operator overrides, so a grant made before tiers shipped still reads
 * as present here.
 *
 * `assignmentsGranted` stays a separate argument on purpose. Assignments &
 * Assessments is sold as a priced add-on with its own
 * `Organization.schoolAssignmentsGranted` column rather than as a rung on
 * the ladder, so no tier includes or excludes it and the column remains its
 * only gate. Folding it into the feature set would quietly turn a product
 * decision made elsewhere into a tier decision.
 *
 * Both gates are UX conveniences, not the security boundary: every page
 * re-enforces its own permission, and every plan-gated page re-checks its
 * feature server-side. Hiding a link the user could still reach by typing
 * the URL would be the worst of both.
 */
export function getSchoolNavigationForTenant(
  tenant: TenantContext,
  entitledFeatures: Set<string>,
  assignmentsGranted = false,
): ModuleNavItem[] {
  const portalGranted = entitledFeatures.has("school.portal");
  // Direct messaging needs both paid capabilities (guardians reply from the
  // portal), so neither alone opens a guardian's Chats link.
  const messagingAvailable = portalGranted && entitledFeatures.has("school.guardianMessaging");

  const permissionByRoute: Array<[string, boolean]> = [
    ["/app/school", hasPermission(tenant, PERMISSIONS.SCHOOL_VIEW)],
    ["/app/school/students", hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_PROFILE_VIEW)],
    ["/app/school/classes", hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE)],
    ["/app/school/academic-periods", hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE)],
    ["/app/school/rollover", hasPermission(tenant, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE)],
    ["/app/school/attendance", hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_VIEW)],
    ["/app/school/exams", hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_PUBLISH) || hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMIC_PERFORMANCE_VIEW)],
    // Assignments & Assessments is its own paid add-on; the service layer re-checks the grant on every call.
    ["/app/school/assignments", assignmentsGranted && hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE)],
    ["/app/school/timetables", hasPermission(tenant, PERMISSIONS.SCHOOL_TIMETABLES_MANAGE)],
    ["/app/school/fees", hasPermission(tenant, PERMISSIONS.SCHOOL_FEES_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_FINANCE_VIEW)],
    ["/app/school/payroll", hasPermission(tenant, PERMISSIONS.SCHOOL_PAYROLL_MANAGE)],
    ["/app/school/transport", hasPermission(tenant, PERMISSIONS.SCHOOL_TRANSPORT_MANAGE)],
    ["/app/school/library", hasPermission(tenant, PERMISSIONS.SCHOOL_LIBRARY_MANAGE)],
    ["/app/school/campuses", hasPermission(tenant, PERMISSIONS.SCHOOL_CAMPUSES_MANAGE)],
    ["/app/school/staff", hasPermission(tenant, PERMISSIONS.SCHOOL_STAFF_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_VIEW)],
    ["/app/school/portal-access", hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_PROFILE_VIEW)],
    ["/app/school/reports", hasPermission(tenant, PERMISSIONS.SCHOOL_REPORTS_VIEW)],
    ["/app/school/settings", hasPermission(tenant, PERMISSIONS.SCHOOL_SETTINGS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_VIEW)],
    ["/app/school/portal", hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW)],
    // These repeat no portal check: the plan gate below reads the
    // catalogue's own `routes` declaration for school.portal, which claims
    // all four portal routes. The assignments add-on is priced separately
    // and is not a tier feature, so its own grant is still checked inline.
    ["/app/school/portal/assignments", assignmentsGranted && hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW) && isSchoolStudentRole(tenant)],
    ["/app/school/portal/announcements", hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW) && isSchoolParentRole(tenant)],
    // Staff chat with staff on School alone; a guardian's own Chats link
    // needs both capabilities. The route itself is deliberately not claimed
    // by a catalogue feature, so staff chat survives on every tier.
    ["/app/school/chats", hasPermission(tenant, PERMISSIONS.SCHOOL_MESSAGES_MANAGE) || (messagingAvailable && hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW) && isSchoolParentRole(tenant))],
    ["/app/school/announcements", hasPermission(tenant, PERMISSIONS.SCHOOL_VIEW)],
  ];

  const allowedRoutes = new Set(
    permissionByRoute
      .filter(([href, permitted]) => permitted && isRouteIncludedInPlan(href, entitledFeatures))
      .map(([href]) => href),
  );
  return schoolNavigation.filter((item) => allowedRoutes.has(item.href));
}

/**
 * Whether the organization's plan includes the feature owning `href`.
 * A route no feature claims is not plan-gated, so it passes.
 */
export function isRouteIncludedInPlan(href: string, entitledFeatures: Set<string>): boolean {
  const owner = moduleTierCatalogue("school").features.find((feature) => feature.routes?.includes(href));
  return !owner || entitledFeatures.has(owner.key);
}
