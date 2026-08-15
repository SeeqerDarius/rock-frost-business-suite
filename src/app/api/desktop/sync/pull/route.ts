import { NextResponse } from "next/server";
import { authenticateOfflineDevice, OfflineAuthenticationError } from "@/lib/offline-sync/auth";
import { buildOfflineSnapshot } from "@/lib/offline-sync/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateOfflineDevice(request);
    const response = await buildOfflineSnapshot(context);
    return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof OfflineAuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Desktop pull synchronization failed", { error });
    return NextResponse.json({ error: "Synchronization failed." }, { status: 500 });
  }
}
