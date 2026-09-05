import { NextResponse, type NextRequest } from "next/server";
import { buildSurfaceUrl, classifyAppSurface } from "@/lib/app-surfaces";
import { checkRateLimit } from "@/lib/rate-limit";

const PUBLIC_PATHS = new Set(["/company", "/contact", "/industries", "/modules", "/solutions"]);
const AUTH_PATHS = ["/login", "/forgot-password", "/reset-password", "/invite"];

// Called from provider-signed webhooks (shared IP pools across unrelated
// merchants), a secret-gated cron dispatcher, an external uptime monitor,
// and device-signed offline sync - none of these should be limited by IP,
// and rate limiting must never consume their request body (the webhook
// routes verify a raw-body signature downstream).
const RATE_LIMIT_EXEMPT_PREFIXES = [
  "/api/payments/paystack/webhook",
  "/api/payments/flutterwave/webhook",
  "/api/cron/",
  "/api/health",
  "/api/offline/",
];

function redirected(surface: "platform" | "tenant" | "public", request: NextRequest, pathname = request.nextUrl.pathname) {
  return NextResponse.redirect(buildSurfaceUrl(surface, pathname, request.nextUrl.search));
}

function resolveSurfaceRedirect(request: NextRequest): NextResponse | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const surface = classifyAppSurface(host);
  const pathname = request.nextUrl.pathname;

  if (surface === "public") {
    if (pathname.startsWith("/app/platform")) return redirected("platform", request);
    if (pathname === "/app" || pathname.startsWith("/app/")) return redirected("tenant", request);
    if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      return redirected("tenant", request);
    }
    return null;
  }

  if (surface === "platform" || surface === "tenant") {
    if (pathname === "/") return redirected(surface, request, "/login");
    if (PUBLIC_PATHS.has(pathname)) return redirected("public", request);

    if (surface === "tenant" && pathname.startsWith("/app/platform")) {
      return redirected("platform", request);
    }
    if (
      surface === "platform" &&
      pathname.startsWith("/app/") &&
      !pathname.startsWith("/app/platform")
    ) {
      return redirected("platform", request, "/app/platform/dashboard");
    }
  }

  return null;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const surfaceRedirect = resolveSurfaceRedirect(request);
  if (surfaceRedirect) return surfaceRedirect;

  const pathname = request.nextUrl.pathname;
  const method = request.method;
  const isApiRoute = pathname.startsWith("/api/");
  // Server Actions are invoked as POST requests to the page route that
  // calls them, not to a separate URL - this is how every one of them
  // reaches this check without needing per-action instrumentation.
  const isMutatingPageRequest = !isApiRoute && method !== "GET" && method !== "HEAD";

  if (isApiRoute || isMutatingPageRequest) {
    const isExempt = isApiRoute && RATE_LIMIT_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (!isExempt) {
      const isAuthSensitive =
        pathname.startsWith("/api/auth/") ||
        (isMutatingPageRequest && AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)));
      const limited = await checkRateLimit(request, {
        tier: isAuthSensitive ? "auth" : "general",
        isApiRoute,
      });
      if (limited) return limited;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

