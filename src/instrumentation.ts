import type { Instrumentation } from "next";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log(JSON.stringify({
      level: "info",
      message: "Rock Frost server instance initialized",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    }));
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest = typeof error === "object" && error && "digest" in error
    ? String(error.digest)
    : undefined;
  console.error(JSON.stringify({
    level: "error",
    message: "Unhandled Next.js request error",
    error: message,
    digest,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  }));
};
