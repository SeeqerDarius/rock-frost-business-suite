import type { TenantContext } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { ModuleNavItem } from "@/types/module";
import { schoolNavigation } from "@/modules/school/navigation";

/**
 * The single source of truth for which School pages the current tenant can
 * open, by permission - School's own layout.tsx calls this to build the
 * sidebar's page list, mirroring
 * src/modules/fleet/navigation-access.ts (see that file's comment for why
 * this stays a separate file from the plain schoolNavigation array).
 * A Parent/Student portal account only ever sees /app/school/portal here.
 */
export function getSchoolNavigationForTenant(tenant: TenantContext): ModuleNavItem[] {
  const routeAccess: Array<[string, boolean]> = [
    ["/app/school", hasPermission(tenant, PERMISSIONS.SCHOOL_VIEW)],
    ["/app/school/students", hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_PROFILE_VIEW)],
    ["/app/school/classes", hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE)],
    ["/app/school/academic-periods", hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE)],
    ["/app/school/attendance", hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_VIEW)],
    ["/app/school/exams", hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_PUBLISH) || hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMIC_PERFORMANCE_VIEW)],
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
  ];
  const allowedRoutes = new Set(routeAccess.filter(([, allowed]) => allowed).map(([href]) => href));
  return schoolNavigation.filter((item) => allowedRoutes.has(item.href));
}
