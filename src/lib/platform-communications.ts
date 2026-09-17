import "server-only";

import { db } from "@/lib/db";
import { PLATFORM_MEMBERSHIP_ROLE_WHERE } from "@/lib/auth/platform-identity";

/**
 * A platform-wide kill switch for SMS *notifications* (Hotel/Pharmacy/
 * Payroll/Hospital/School's per-module `smsNotificationsEnabled` toggles),
 * stored on the platform operator organization's own `metadata` JSON —
 * the same mechanism `readPlatformMarketing()` uses, edited from the
 * "Communications" card on /app/platform/settings. Deliberately does not
 * gate 2FA OTP codes: turning off marketing/notification texts should
 * never also lock people out of signing in. Defaults to enabled so
 * existing per-module toggles keep working unless a platform operator has
 * explicitly turned this off.
 */
export interface PlatformCommunicationsSettings {
  smsNotificationsEnabled: boolean;
}

export const DEFAULT_PLATFORM_COMMUNICATIONS: PlatformCommunicationsSettings = {
  smsNotificationsEnabled: true,
};

export function readPlatformCommunicationsSettings(metadata: unknown): PlatformCommunicationsSettings {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return DEFAULT_PLATFORM_COMMUNICATIONS;
  const raw = (metadata as Record<string, unknown>).smsNotifications;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_PLATFORM_COMMUNICATIONS;
  const enabled = (raw as Record<string, unknown>).enabled;
  return { smsNotificationsEnabled: typeof enabled === "boolean" ? enabled : true };
}

/**
 * Deliberately its own uncached query rather than reusing
 * `findPlatformOrganizationMetadata()` (platform-marketing.ts) - that
 * helper wraps `unstable_cache`, and `sendSms()` is called from every
 * module's service layer, so pulling `next/cache` into that import chain
 * would force every test file that mocks `@/lib/db` around an SMS-sending
 * module to also mock `next/cache`. A kill switch should also read as
 * fresh as possible anyway, not wait out a cache window.
 */
export async function isPlatformSmsNotificationsEnabled(): Promise<boolean> {
  const platformOrganization = await db.organization.findFirst({
    where: { members: { some: { status: "ACTIVE", role: PLATFORM_MEMBERSHIP_ROLE_WHERE } } },
    select: { metadata: true },
  });
  return readPlatformCommunicationsSettings(platformOrganization?.metadata).smsNotificationsEnabled;
}
