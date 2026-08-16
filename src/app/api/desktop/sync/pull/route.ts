import { NextResponse } from "next/server";
import { authenticateOfflineDevice, OfflineAuthenticationError } from "@/lib/offline-sync/auth";
import { buildOfflineSnapshot } from "@/lib/offline-sync/service";
import { desktopPreflightResponse, withDesktopCors } from "@/lib/offline-sync/desktop-cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return desktopPreflightResponse();
}

export async function GET(request: Request) {
  try {
    const context = await authenticateOfflineDevice(request);
    const response = await buildOfflineSnapshot(context);
    return withDesktopCors(NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } }));
  } catch (error) {
    if (error instanceof OfflineAuthenticationError) {
      return withDesktopCors(NextResponse.json({ error: error.message }, { status: error.status }));
    }
    console.error("Desktop pull synchronization failed", { error });
    return withDesktopCors(NextResponse.json({ error: "Synchronization failed." }, { status: 500 }));
  }
}
