import { NextResponse, type NextRequest } from "next/server";
import { buildSurfaceUrl, classifyAppSurface } from "@/lib/app-surfaces";

const PUBLIC_PATHS = new Set(["/company", "/contact", "/industries", "/modules", "/solutions"]);
const AUTH_PATHS = ["/login", "/forgot-password", "/reset-password", "/invite"];

function redirected(surface: "platform" | "tenant" | "public", request: NextRequest, pathname = request.nextUrl.pathname) {
  return NextResponse.redirect(buildSurfaceUrl(surface, pathname, request.nextUrl.search));
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const surface = classifyAppSurface(host);
  const pathname = request.nextUrl.pathname;

  if (surface === "public") {
    if (pathname.startsWith("/app/platform")) return redirected("platform", request);
    if (pathname === "/app" || pathname.startsWith("/app/")) return redirected("tenant", request);
    if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      return redirected("tenant", request);
    }
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

