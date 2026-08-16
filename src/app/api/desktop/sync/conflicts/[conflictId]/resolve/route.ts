import { NextResponse } from "next/server";
import { authenticateOfflineDevice, OfflineAuthenticationError } from "@/lib/offline-sync/auth";
import { conflictResolutionSchema } from "@/lib/offline-sync/contract";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { desktopPreflightResponse, withDesktopCors } from "@/lib/offline-sync/desktop-cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return desktopPreflightResponse();
}

export async function POST(request: Request, context: { params: Promise<{ conflictId: string }> }) {
  try {
    const deviceContext = await authenticateOfflineDevice(request);
    const parsed = conflictResolutionSchema.safeParse(await request.json());
    if (!parsed.success) return withDesktopCors(NextResponse.json({ error: "Invalid conflict resolution." }, { status: 400 }));
    const { conflictId } = await context.params;
    const conflict = await db.offlineConflict.findFirst({
      where: { id: conflictId, organizationId: deviceContext.device.organizationId, deviceId: deviceContext.device.id, status: "OPEN" },
    });
    if (!conflict) return withDesktopCors(NextResponse.json({ error: "Open conflict not found." }, { status: 404 }));
    const updated = await db.offlineConflict.update({
      where: { id: conflict.id },
      data: { status: "RESOLVED", resolution: parsed.data.resolution, resolvedById: deviceContext.device.userId, resolvedAt: new Date() },
    });
    await logAuditEvent({
      organizationId: deviceContext.device.organizationId,
      userId: deviceContext.device.userId,
      membershipId: deviceContext.device.membershipId,
      module: "administration",
      action: "offline_conflict.resolved",
      entityName: "OfflineConflict",
      entityId: conflict.id,
      metadata: { resolution: parsed.data.resolution },
    });
    return withDesktopCors(NextResponse.json({ conflictId: updated.id, status: updated.status.toLowerCase(), resolution: updated.resolution }));
  } catch (error) {
    if (error instanceof OfflineAuthenticationError) {
      return withDesktopCors(NextResponse.json({ error: error.message }, { status: error.status }));
    }
    if (error instanceof SyntaxError) return withDesktopCors(NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }));
    console.error("Desktop conflict resolution failed", { error });
    return withDesktopCors(NextResponse.json({ error: "Conflict resolution failed." }, { status: 500 }));
  }
}
