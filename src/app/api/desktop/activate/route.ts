import { NextResponse } from "next/server";
import { activationSchema } from "@/lib/offline-sync/contract";
import { exchangeOfflineActivationCode } from "@/lib/offline-sync/service";
import { OfflineMutationDeniedError } from "@/lib/offline-sync/adapters";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = activationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid activation request." }, { status: 400 });
  try {
    const activated = await exchangeOfflineActivationCode(parsed.data);
    return NextResponse.json(activated, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof OfflineMutationDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Desktop activation failed", { error });
    return NextResponse.json({ error: "Desktop activation failed." }, { status: 500 });
  }
}
