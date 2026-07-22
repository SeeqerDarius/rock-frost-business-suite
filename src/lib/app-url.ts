import "server-only";

type SearchParamValue = string | number | boolean | null | undefined;

const LOCAL_DEVELOPMENT_ORIGIN = "http://localhost:3000";

function normalizeOrigin(value: string, variableName: string, allowBareHostname = false): string {
  const trimmed = value.trim();
  const hasProtocol = /^https?:\/\//i.test(trimmed);
  if (!hasProtocol && !allowBareHostname) {
    throw new Error(`${variableName} must include an http:// or https:// scheme.`);
  }
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${variableName} must be a valid HTTP(S) origin.`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${variableName} must use HTTP or HTTPS.`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${variableName} must contain only an origin, without credentials, a path, query parameters, or a fragment.`);
  }

  if (process.env.NODE_ENV === "production") {
    const hostname = url.hostname.toLowerCase();
    const isLoopback =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";

    if (isLoopback) throw new Error(`${variableName} cannot use a loopback host in production.`);
    if (url.protocol !== "https:") throw new Error(`${variableName} must use HTTPS in production.`);
  }

  return url.origin;
}

/**
 * Returns the canonical server-side origin used for absolute links.
 *
 * NEXTAUTH_URL is the primary application origin and is already required by
 * the authentication deployment. NEXT_PUBLIC_SITE_URL remains a compatibility
 * fallback for older environments; Vercel's automatically supplied hostnames
 * provide a final deployment fallback. Production deliberately has no
 * localhost fallback so a missing configuration cannot create unusable email
 * links silently.
 */
export function getAppOrigin(): string {
  const candidates: Array<[string, string | undefined, boolean]> = [
    ["NEXTAUTH_URL", process.env.NEXTAUTH_URL, false],
    ["NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL, false],
    ["VERCEL_PROJECT_PRODUCTION_URL", process.env.VERCEL_PROJECT_PRODUCTION_URL, true],
    ["VERCEL_URL", process.env.VERCEL_URL, true],
  ];

  for (const [variableName, value, allowBareHostname] of candidates) {
    if (value?.trim()) return normalizeOrigin(value, variableName, allowBareHostname);
  }

  if (process.env.NODE_ENV !== "production") return LOCAL_DEVELOPMENT_ORIGIN;

  throw new Error(
    "Application URL is not configured. Set NEXTAUTH_URL to the canonical production origin before sending email links.",
  );
}

/** Builds an absolute application URL while encoding all query parameters. */
export function buildAppUrl(pathname: string, searchParams: Record<string, SearchParamValue> = {}): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\") || /[?#]/.test(pathname)) {
    throw new Error("Application URL paths must be root-relative and cannot contain a host, backslash, query, or fragment.");
  }

  const origin = getAppOrigin();
  const url = new URL(pathname, `${origin}/`);
  if (url.origin !== origin) throw new Error("Application URL paths cannot escape the configured origin.");

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }

  return url.toString();
}
