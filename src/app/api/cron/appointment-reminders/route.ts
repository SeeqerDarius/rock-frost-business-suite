import { timingSafeEqual } from "node:crypto";
import { generateCorrelationId } from "@/lib/audit";
import { sendDueAppointmentReminders } from "@/modules/hospital/service";

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
      message: "Unauthorized appointment-reminders cron request",
      route: "/api/cron/appointment-reminders",
      correlationId,
      requestId,
    }));
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  console.log(JSON.stringify({
    level: "info",
    message: "Appointment-reminders cron started",
    route: "/api/cron/appointment-reminders",
    correlationId,
    requestId,
  }));

  try {
    const result = await sendDueAppointmentReminders();
    console.log(JSON.stringify({
      level: "info",
      message: "Appointment-reminders cron completed",
      route: "/api/cron/appointment-reminders",
      correlationId,
      requestId,
      candidates: result.candidates,
      sent: result.sent,
      durationMs: Date.now() - startedAt,
    }));
    return Response.json({ ok: true, correlationId, candidates: result.candidates, sent: result.sent });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Appointment-reminders cron failed",
      route: "/api/cron/appointment-reminders",
      correlationId,
      requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    }));
    return Response.json({ ok: false, error: "Appointment reminders failed", correlationId }, { status: 500 });
  }
}
