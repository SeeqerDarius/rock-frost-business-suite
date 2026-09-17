import "server-only";

import { db } from "@/lib/db";
import { hasModuleFeature } from "@/platform/entitlements/resolve";

/**
 * Whether one module in one organization may send an SMS notification.
 *
 * This is the question the old `isOrganizationSmsNotificationsGranted()`
 * could not answer. SMS used to be a single `Organization` boolean covering
 * every module at once, which is what made "SMS is on for this customer" and
 * "SMS is on for this customer's School" the same sentence when they are not.
 *
 * Two layers, in this order:
 *
 * 1. `Organization.smsNotificationsGranted` is an **operator override**. When
 *    set, every module may send, exactly as it does today. That is what keeps
 *    the tier rollout from withdrawing SMS from any organization an operator
 *    already granted it to, and it is why this check comes first.
 * 2. Otherwise the module's own plan tier decides, via its `<module>.sms`
 *    feature. School declares one (Pro and up). Hotel, Pharmacy, Payroll and
 *    Hospital deliberately declare none while their ladders are pending, so
 *    for them an unset override means no SMS, which is their behavior today.
 *    Declaring a feature for them early would make it tier-included and so
 *    ungated, loosening billing rather than tightening it.
 *
 * Deliberately uncached and direct, like the resolver it delegates to:
 * `sendSms()` is reachable from every module's service layer, and pulling
 * `next/cache` into that import chain would force every mocked-db test around
 * an SMS-sending module to also mock `next/cache`.
 */
export async function canSendModuleSms(organizationId: string, moduleKey: string): Promise<boolean> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { smsNotificationsGranted: true },
  });
  if (organization?.smsNotificationsGranted) return true;
  return hasModuleFeature(organizationId, `${moduleKey}.sms`);
}

/**
 * The raw operator override, for the Configuration pane's own toggle row and
 * for the amber "not enabled for your organization yet" notes a module's
 * Settings page shows. Callers deciding whether an actual message may go out
 * must use `canSendModuleSms()` instead: this one only reports the override,
 * not the module's tier.
 */
export async function isOrganizationSmsNotificationsGranted(organizationId: string): Promise<boolean> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { smsNotificationsGranted: true },
  });
  return organization?.smsNotificationsGranted ?? false;
}

/**
 * The Parent/Student portal, now resolved from School's plan tier
 * (`school.portal`, Platinum and up) with `Organization.schoolPortalGranted`
 * folded in by the resolver as an override, so an organization an operator
 * already granted it to keeps it at any tier. Gates /app/school/portal and
 * /app/school/portal-access regardless of a user's Parent/Student role or a
 * staff member's own permissions. See docs/SCHOOL_PARENT_STUDENT_PORTAL.md
 * and docs/PLAN_TIERS.md.
 */
export async function isSchoolPortalGranted(organizationId: string): Promise<boolean> {
  return hasModuleFeature(organizationId, "school.portal");
}
