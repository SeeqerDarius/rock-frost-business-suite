import { NextResponse } from "next/server";
import { authenticateOfflineDevice, OfflineAuthenticationError } from "@/lib/offline-sync/auth";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { desktopPreflightResponse, withDesktopCors } from "@/lib/offline-sync/desktop-cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return desktopPreflightResponse(request);
}

export async function POST(request: Request) {
  try {
    const context = await authenticateOfflineDevice(request);
    await db.offlineDevice.update({
      where: { id: context.device.id },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: context.device.userId },
    });
    await logAuditEvent({
      organizationId: context.device.organizationId,
      userId: context.device.userId,
      membershipId: context.device.membershipId,
      module: "administration",
      action: "offline_device.deactivated",
      entityName: "OfflineDevice",
      entityId: context.device.id,
    });
    return withDesktopCors(NextResponse.json({ deactivated: true }, { headers: { "Cache-Control": "private, no-store" } }), request);
  } catch (error) {
    if (error instanceof OfflineAuthenticationError) {
      return withDesktopCors(NextResponse.json({ error: error.message }, { status: error.status }), request);
    }
    console.error("Desktop deactivation failed", { error });
    return withDesktopCors(NextResponse.json({ error: "Desktop deactivation failed." }, { status: 500 }), request);
  }
}
