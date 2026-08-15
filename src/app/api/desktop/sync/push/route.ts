import { NextResponse } from "next/server";
import { authenticateOfflineDevice, OfflineAuthenticationError } from "@/lib/offline-sync/auth";
import { pushBatchSchema } from "@/lib/offline-sync/contract";
import { processOfflineMutation } from "@/lib/offline-sync/service";
import { OfflineMutationDeniedError } from "@/lib/offline-sync/adapters";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await authenticateOfflineDevice(request);
    const parsed = pushBatchSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid synchronization batch." }, { status: 400 });
    const results = [];
    for (const mutation of parsed.data.mutations) {
      try {
        results.push(await processOfflineMutation(context, mutation));
      } catch (error) {
        if (error instanceof OfflineMutationDeniedError) {
          results.push({ mutationId: mutation.mutationId, status: "rejected", result: null, errorCode: "ACCESS_REVOKED" });
          continue;
        }
        throw error;
      }
    }
    return NextResponse.json(
      { results, offlineAccessUntil: context.device.offlineAccessUntil.toISOString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof OfflineAuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    console.error("Desktop push synchronization failed", { error });
    return NextResponse.json({ error: "Synchronization failed." }, { status: 500 });
  }
}
