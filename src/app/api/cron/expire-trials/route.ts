import { timingSafeEqual } from "node:crypto";
import { expireTrials } from "@/platform/trials/service";
import { generateCorrelationId } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const correlationId = generateCorrelationId();
  const requestId = request.headers.get("x-vercel-id");

  if (!isAuthorized(request)) {
    console.warn(JSON.stringify({
      level: "warn",
      message: "Unauthorized trial-expiry cron request",
      route: "/api/cron/expire-trials",
      correlationId,
      requestId,
    }));
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  console.log(JSON.stringify({
    level: "info",
    message: "Trial-expiry cron started",
    route: "/api/cron/expire-trials",
    correlationId,
    requestId,
  }));

  try {
    const result = await expireTrials();
    console.log(JSON.stringify({
      level: "info",
      message: "Trial-expiry cron completed",
      route: "/api/cron/expire-trials",
      correlationId,
      requestId,
      candidates: result.candidates,
      expired: result.expired,
      durationMs: Date.now() - startedAt,
    }));
    return Response.json({
      ok: true,
      correlationId,
      candidates: result.candidates,
      expired: result.expired,
      cutoff: result.cutoff.toISOString(),
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Trial-expiry cron failed",
      route: "/api/cron/expire-trials",
      correlationId,
      requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    }));
    return Response.json({ ok: false, error: "Trial expiry failed", correlationId }, { status: 500 });
  }
}
