import { db } from "@/lib/db";
import { generateCorrelationId } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const correlationId = generateCorrelationId();
  const requestId = request.headers.get("x-vercel-id");

  try {
    await db.$queryRaw`SELECT 1`;
    const durationMs = Date.now() - startedAt;
    console.log(JSON.stringify({
      level: "info",
      message: "Health check passed",
      route: "/api/health",
      correlationId,
      requestId,
      durationMs,
    }));
    return Response.json(
      { ok: true, database: "reachable", correlationId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(JSON.stringify({
      level: "error",
      message: "Health check failed",
      route: "/api/health",
      correlationId,
      requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    }));
    return Response.json(
      { ok: false, database: "unreachable", correlationId },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
