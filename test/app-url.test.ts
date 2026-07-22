import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAppUrl, getAppOrigin } from "@/lib/app-url";

const URL_ENV_KEYS = ["NEXTAUTH_URL", "NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;

function clearUrlEnvironment() {
  for (const key of URL_ENV_KEYS) vi.stubEnv(key, "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canonical application URL", () => {
  it("uses NEXTAUTH_URL as the single preferred canonical origin", () => {
    clearUrlEnvironment();
    vi.stubEnv("NEXTAUTH_URL", "https://www.rockfrostgroup.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://stale.example.com");

    expect(getAppOrigin()).toBe("https://www.rockfrostgroup.com");
  });

  it("supports the legacy public URL when NEXTAUTH_URL is absent", () => {
    clearUrlEnvironment();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://legacy.example.com");

    expect(getAppOrigin()).toBe("https://legacy.example.com");
  });

  it("normalizes Vercel's automatically supplied production hostname", () => {
    clearUrlEnvironment();
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "rock-frost-business-suite.vercel.app");

    expect(getAppOrigin()).toBe("https://rock-frost-business-suite.vercel.app");
  });

  it("builds absolute email links with safely encoded query parameters", () => {
    clearUrlEnvironment();
    vi.stubEnv("NEXTAUTH_URL", "https://www.rockfrostgroup.com");

    expect(buildAppUrl("/reset-password", { email: "person+ops@example.com", token: "a&b" })).toBe(
      "https://www.rockfrostgroup.com/reset-password?email=person%2Bops%40example.com&token=a%26b",
    );
  });

  it("uses localhost only outside production", () => {
    clearUrlEnvironment();
    vi.stubEnv("NODE_ENV", "development");

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("fails closed when production has no canonical or Vercel URL", () => {
    clearUrlEnvironment();
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getAppOrigin()).toThrow("Application URL is not configured");
  });

  it("rejects localhost and non-HTTPS canonical origins in production", () => {
    clearUrlEnvironment();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect(() => getAppOrigin()).toThrow("cannot use a loopback host in production");

    vi.stubEnv("NEXTAUTH_URL", "http://rockfrostgroup.com");
    expect(() => getAppOrigin()).toThrow("must use HTTPS in production");
  });

  it("requires explicit configuration variables to include their scheme", () => {
    clearUrlEnvironment();
    vi.stubEnv("NEXTAUTH_URL", "www.rockfrostgroup.com");

    expect(() => getAppOrigin()).toThrow("must include an http:// or https:// scheme");
  });

  it("rejects configured values that contain a path", () => {
    clearUrlEnvironment();
    vi.stubEnv("NEXTAUTH_URL", "https://www.rockfrostgroup.com/app");

    expect(() => getAppOrigin()).toThrow("must contain only an origin");
  });

  it("rejects protocol-relative paths that could escape the application origin", () => {
    clearUrlEnvironment();
    vi.stubEnv("NEXTAUTH_URL", "https://www.rockfrostgroup.com");

    expect(() => buildAppUrl("//attacker.example/reset", { token: "secret" })).toThrow("must be root-relative");
  });
});
