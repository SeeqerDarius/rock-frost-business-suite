import { NextResponse } from "next/server";
import { authenticateOfflineDevice, OfflineAuthenticationError } from "@/lib/offline-sync/auth";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ deactivated: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof OfflineAuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Desktop deactivation failed", { error });
    return NextResponse.json({ error: "Desktop deactivation failed." }, { status: 500 });
  }
}
