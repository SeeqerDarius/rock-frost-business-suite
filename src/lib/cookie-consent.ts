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

export function serializeCookieConsent(consent: CookieConsent, secure: boolean): string {
  return [
    `${COOKIE_CONSENT_NAME}=${consent}`,
    "Path=/",
    `Max-Age=${COOKIE_CONSENT_MAX_AGE}`,
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
