import { describe, expect, it } from "vitest";
import {
  COOKIE_CONSENT_MAX_AGE,
  readCookieConsent,
  serializeCookieConsent,
} from "@/lib/cookie-consent";

describe("cookie consent", () => {
  it("reads only supported consent values", () => {
    expect(readCookieConsent("theme=dark; rf_cookie_consent=analytics; session=abc")).toBe("analytics");
    expect(readCookieConsent("rf_cookie_consent=essential")).toBe("essential");
    expect(readCookieConsent("rf_cookie_consent=unexpected")).toBeNull();
    expect(readCookieConsent("")).toBeNull();
  });

  it("serializes a scoped preference with production safeguards", () => {
    expect(serializeCookieConsent("analytics", true, "localhost")).toBe(
      `rf_cookie_consent=analytics; Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE}; SameSite=Lax; Secure`,
    );
    expect(serializeCookieConsent("essential", false, "localhost")).not.toContain("Secure");
  });

  it("scopes the cookie to the whole apex domain only on a real production hostname", () => {
    expect(serializeCookieConsent("analytics", true, "app.rockfrostgroup.com")).toContain("Domain=.rockfrostgroup.com");
    expect(serializeCookieConsent("analytics", true, "www.rockfrostgroup.com")).toContain("Domain=.rockfrostgroup.com");
    expect(serializeCookieConsent("analytics", true, "admin.rockfrostgroup.com")).toContain("Domain=.rockfrostgroup.com");
    expect(serializeCookieConsent("analytics", true, "rockfrostgroup.com")).toContain("Domain=.rockfrostgroup.com");
    expect(serializeCookieConsent("analytics", true, "localhost")).not.toContain("Domain=");
    expect(serializeCookieConsent("analytics", true, "my-preview.vercel.app")).not.toContain("Domain=");
  });
});
