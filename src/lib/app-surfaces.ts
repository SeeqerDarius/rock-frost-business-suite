export type AppSurface = "platform" | "tenant" | "public" | "local" | "unknown";

const DEFAULT_PUBLIC_ORIGIN = "https://www.rockfrostgroup.com";
const DEFAULT_PLATFORM_ORIGIN = "https://admin.rockfrostgroup.com";
const DEFAULT_TENANT_ORIGIN = "https://app.rockfrostgroup.com";

function configuredOrigin(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  try {
    return new URL(value).origin;
  } catch {
    return fallback;
  }
}

export function getSurfaceOrigins() {
  return {
    public: configuredOrigin(process.env.NEXT_PUBLIC_SITE_URL, DEFAULT_PUBLIC_ORIGIN),
    platform: configuredOrigin(process.env.PLATFORM_APP_URL, DEFAULT_PLATFORM_ORIGIN),
    tenant: configuredOrigin(process.env.TENANT_APP_URL, DEFAULT_TENANT_ORIGIN),
  } as const;
}

export function normalizeHostname(host: string | null | undefined): string {
  const value = host?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!value) return "";
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1);
  return value.split(":")[0];
}

export function classifyAppSurface(host: string | null | undefined): AppSurface {
  const hostname = normalizeHostname(host);
  if (!hostname) return "unknown";
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]") {
    return "local";
  }

  const origins = getSurfaceOrigins();
  if (hostname === new URL(origins.platform).hostname) return "platform";
  if (hostname === new URL(origins.tenant).hostname) return "tenant";
  if (
    hostname === new URL(origins.public).hostname ||
    hostname === "rockfrostgroup.com" ||
    hostname === "www.rockfrostgroup.com"
  ) {
    return "public";
  }
  return "unknown";
}

export function isIdentityAllowedOnSurface(isPlatformIdentity: boolean, surface: AppSurface): boolean {
  if (surface === "platform") return isPlatformIdentity;
  if (surface === "tenant") return !isPlatformIdentity;
  return true;
}

export function buildSurfaceUrl(
  surface: "platform" | "tenant" | "public",
  pathname: string,
  search = "",
): URL {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    throw new Error("Surface paths must be root-relative.");
  }
  const url = new URL(pathname, `${getSurfaceOrigins()[surface]}/`);
  url.search = search;
  return url;
}

export function isTrustedAppOrigin(origin: string): boolean {
  const origins = getSurfaceOrigins();
  if (Object.values(origins).includes(origin as never)) return true;
  try {
    const hostname = new URL(origin).hostname;
    return classifyAppSurface(hostname) === "local";
  } catch {
    return false;
  }
}

