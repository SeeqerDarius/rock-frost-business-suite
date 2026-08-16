import { NextResponse } from "next/server";
import { activationSchema } from "@/lib/offline-sync/contract";
import { exchangeOfflineActivationCode } from "@/lib/offline-sync/service";
import { OfflineMutationDeniedError } from "@/lib/offline-sync/adapters";
import { desktopPreflightResponse, withDesktopCors } from "@/lib/offline-sync/desktop-cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return desktopPreflightResponse();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withDesktopCors(NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }));
  }
  const parsed = activationSchema.safeParse(body);
  if (!parsed.success) return withDesktopCors(NextResponse.json({ error: "Invalid activation request." }, { status: 400 }));
  try {
    const activated = await exchangeOfflineActivationCode(parsed.data);
    return withDesktopCors(NextResponse.json(activated, { headers: { "Cache-Control": "private, no-store" } }));
  } catch (error) {
    if (error instanceof OfflineMutationDeniedError) {
      return withDesktopCors(NextResponse.json({ error: error.message }, { status: 403 }));
    }
    console.error("Desktop activation failed", { error });
    return withDesktopCors(NextResponse.json({ error: "Desktop activation failed." }, { status: 500 }));
  }
}
