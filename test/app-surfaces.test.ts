import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSurfaceUrl,
  classifyAppSurface,
  isIdentityAllowedOnSurface,
  isTrustedAppOrigin,
  normalizeHostname,
} from "@/lib/app-surfaces";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("application host surfaces", () => {
  it("normalizes forwarded hosts without leaking ports or proxy lists", () => {
    expect(normalizeHostname("ADMIN.ROCKFROSTGROUP.COM:443")).toBe("admin.rockfrostgroup.com");
    expect(normalizeHostname("app.rockfrostgroup.com, proxy.internal")).toBe("app.rockfrostgroup.com");
  });

  it("classifies public, platform, tenant, and local hosts", () => {
    expect(classifyAppSurface("www.rockfrostgroup.com")).toBe("public");
    expect(classifyAppSurface("admin.rockfrostgroup.com")).toBe("platform");
    expect(classifyAppSurface("app.rockfrostgroup.com")).toBe("tenant");
    expect(classifyAppSurface("localhost:3000")).toBe("local");
  });

  it("allows each production identity only on its own application surface", () => {
    expect(isIdentityAllowedOnSurface(true, "platform")).toBe(true);
    expect(isIdentityAllowedOnSurface(true, "tenant")).toBe(false);
    expect(isIdentityAllowedOnSurface(false, "tenant")).toBe(true);
    expect(isIdentityAllowedOnSurface(false, "platform")).toBe(false);
  });

  it("builds scoped URLs and rejects untrusted authentication redirects", () => {
    expect(buildSurfaceUrl("platform", "/login").toString()).toBe("https://admin.rockfrostgroup.com/login");
    expect(buildSurfaceUrl("tenant", "/app/dashboard", "?joined=1").toString()).toBe(
      "https://app.rockfrostgroup.com/app/dashboard?joined=1",
    );
    expect(isTrustedAppOrigin("https://admin.rockfrostgroup.com")).toBe(true);
    expect(isTrustedAppOrigin("https://attacker.example")).toBe(false);
  });
});

