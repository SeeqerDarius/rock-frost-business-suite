import { timingSafeEqual } from "node:crypto";
import { generateDueRecurringTransactions } from "@/modules/accounting/service";
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
      message: "Unauthorized recurring-transactions cron request",
      route: "/api/cron/recurring-transactions",
      correlationId,
      requestId,
    }));
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  console.log(JSON.stringify({
    level: "info",
    message: "Recurring-transactions cron started",
    route: "/api/cron/recurring-transactions",
    correlationId,
    requestId,
  }));

  try {
    const result = await generateDueRecurringTransactions();
    console.log(JSON.stringify({
      level: "info",
      message: "Recurring-transactions cron completed",
      route: "/api/cron/recurring-transactions",
      correlationId,
      requestId,
      candidates: result.candidates,
      generated: result.generated,
      failed: result.failures.length,
      durationMs: Date.now() - startedAt,
    }));
    if (result.failures.length > 0) {
      console.error(JSON.stringify({
        level: "error",
        message: "Some recurring templates failed to generate",
        route: "/api/cron/recurring-transactions",
        correlationId,
        requestId,
        failures: result.failures,
      }));
    }
    return Response.json({ ok: true, correlationId, candidates: result.candidates, generated: result.generated, failed: result.failures.length });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Recurring-transactions cron failed",
      route: "/api/cron/recurring-transactions",
      correlationId,
      requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    }));
    return Response.json({ ok: false, error: "Recurring-transactions sweep failed", correlationId }, { status: 500 });
  }
}
