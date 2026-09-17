import "server-only";

import { db } from "@/lib/db";

/**
 * SMS notifications are a paid add-on a platform operator grants to one
 * organization at a time (`Organization.smsNotificationsGranted`, toggled
 * from that organization's own detail page at
 * /app/platform/organizations/[organizationId] - see
 * toggleOrganizationSmsNotifications() in src/app/app/platform/actions.ts),
 * the same shape and intent as the existing offlineAccessGranted
 * entitlement. Every organization defaults ungranted. Granting it doesn't
 * turn SMS on by itself - it only lets that organization's own admin then
 * enable a specific module's own smsNotificationsEnabled toggle
 * (School/Hotel/Pharmacy/Payroll/Hospital), which still defaults off.
 * Deliberately its own direct, uncached query (not routed through
 * `next/cache`) - `sendSms()` is reachable from every module's service
 * layer, and pulling `unstable_cache`/`next/cache` into that shared import
 * chain would force every mocked-db test around an SMS-sending module to
 * also mock `next/cache`. An entitlement check should also read as fresh
 * as possible, not wait out a cache window.
 */
export async function isOrganizationSmsNotificationsGranted(organizationId: string): Promise<boolean> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { smsNotificationsGranted: true },
  });
  return organization?.smsNotificationsGranted ?? false;
}

/**
 * The Parent/Student portal is the same kind of paid, per-organization
 * add-on (`Organization.schoolPortalGranted`), gating
 * /app/school/portal and /app/school/portal-access regardless of a
 * user's Parent/Student role or a staff member's own permissions. See
 * docs/SCHOOL_PARENT_STUDENT_PORTAL.md.
 */
export async function isSchoolPortalGranted(organizationId: string): Promise<boolean> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { schoolPortalGranted: true },
  });
  return organization?.schoolPortalGranted ?? false;
}
