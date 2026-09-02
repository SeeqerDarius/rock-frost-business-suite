import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { getCurrentTenant } from "@/lib/tenant";

const resolutionSchema = z.object({ conflictId: z.string().min(1).max(100), resolution: z.enum(["KEEP_SERVER", "MANAGER_REVIEW"]) });
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }

export async function GET() {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conflicts = await db.offlineConflict.findMany({
    where: { organizationId: tenant.organizationId, mutation: { userId: tenant.userId } },
    include: { mutation: { select: { mutationId: true, moduleKey: true, entityType: true, operation: true, payload: true, changedAt: true, result: true } }, resolvedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ conflicts: conflicts.map((conflict) => ({
    conflictId: conflict.id,
    operationId: conflict.mutation.mutationId,
    module: conflict.mutation.moduleKey,
    entityType: conflict.mutation.entityType,
    workflow: conflict.mutation.operation,
    localValue: conflict.mutation.payload,
    serverValue: conflict.cloudSnapshot,
    localChangedAt: conflict.mutation.changedAt,
    serverChangedAt: conflict.cloudVersion ? new Date(conflict.cloudVersion).toISOString() : null,
    serverChangedBy: conflict.resolvedBy?.name ?? conflict.resolvedBy?.email ?? null,
    conflictType: conflict.conflictType,
    allowedResolutions: conflict.allowedResolutions,
    status: conflict.status.toLowerCase(),
    resolution: conflict.resolution,
  })) });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross-origin-request" }, { status: 403 });
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = resolutionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  const conflict = await db.offlineConflict.findFirst({ where: { id: parsed.data.conflictId, organizationId: tenant.organizationId, status: "OPEN", mutation: { userId: tenant.userId } }, include: { mutation: true } });
  if (!conflict || !conflict.allowedResolutions.includes(parsed.data.resolution)) return NextResponse.json({ error: "conflict-unavailable" }, { status: 404 });
  if (parsed.data.resolution === "MANAGER_REVIEW") {
    await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: conflict.mutation.moduleKey, action: "offline_conflict.manager_review_requested", entityName: conflict.mutation.entityType, entityId: conflict.mutation.entityId, correlationId: conflict.mutation.mutationId });
    return NextResponse.json({ status: "open", resolution: "MANAGER_REVIEW" });
  }
  await db.offlineConflict.update({ where: { id: conflict.id }, data: { status: "RESOLVED", resolution: "KEEP_SERVER", resolvedById: tenant.userId, resolvedAt: new Date() } });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: conflict.mutation.moduleKey, action: "offline_conflict.resolved_keep_server", entityName: conflict.mutation.entityType, entityId: conflict.mutation.entityId, correlationId: conflict.mutation.mutationId });
  return NextResponse.json({ status: "resolved", resolution: "KEEP_SERVER", operationId: conflict.mutation.mutationId });
}
