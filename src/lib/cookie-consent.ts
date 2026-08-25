export const COOKIE_CONSENT_NAME = "rf_cookie_consent";
export const COOKIE_CONSENT_MAX_AGE = 60 * 60 * 24 * 180;
export const OPEN_COOKIE_SETTINGS_EVENT = "rf:open-cookie-settings";
export const COOKIE_CONSENT_CHANGED_EVENT = "rf:cookie-consent-changed";

export type CookieConsent = "essential" | "analytics";

export function readCookieConsent(cookieHeader: string): CookieConsent | null {
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_CONSENT_NAME}=`))
    ?.slice(COOKIE_CONSENT_NAME.length + 1);

  return value === "essential" || value === "analytics" ? value : null;
}

const CONSENT_ROOT_DOMAIN = "rockfrostgroup.com";

/**
 * This app serves www/app/admin.rockfrostgroup.com from one deployment. Auth
 * cookies are deliberately host-only (see docs/ARCHITECTURE.md) to avoid an
 * owner/tenant session collision, but consent has the opposite requirement:
 * accepting on one hostname should count on all three, or the banner keeps
 * reappearing as the user moves between them. Scope the domain only when the
 * current host is actually one of the three production hostnames, never on
 * localhost or a preview deployment, where a `rockfrostgroup.com` Domain
 * attribute would just make the browser reject the cookie outright.
 */
function domainAttributeFor(hostname: string): string {
  return hostname === CONSENT_ROOT_DOMAIN || hostname.endsWith(`.${CONSENT_ROOT_DOMAIN}`)
    ? `Domain=.${CONSENT_ROOT_DOMAIN}`
    : "";
}

export function serializeCookieConsent(consent: CookieConsent, secure: boolean, hostname: string): string {
  return [
    `${COOKIE_CONSENT_NAME}=${consent}`,
    "Path=/",
    `Max-Age=${COOKIE_CONSENT_MAX_AGE}`,
    "SameSite=Lax",
    domainAttributeFor(hostname),
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
