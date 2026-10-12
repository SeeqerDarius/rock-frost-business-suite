import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";
import { contentDisposition } from "@/modules/contracts/rules";
import { actorFromTenant, ContractError, getContractDocumentForDownload } from "@/modules/contracts/service";

/**
 * Private contract document download. Re-checks the session organization,
 * module entitlement, contracts.view, and confidentiality on every request,
 * verifies the stored checksum, and audits the download. Responses are never
 * cached. A document in another organization is reported as not found.
 *
 * `?view=1` opens a PDF in the browser's own viewer instead of downloading
 * it. Every other file type is always sent as an attachment.
 */
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "contracts")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { documentId } = await params;
  const view = new URL(request.url).searchParams.get("view") === "1";
  try {
    const file = await getContractDocumentForDownload(actorFromTenant(tenant), documentId, { view });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": contentDisposition(file.fileName, file.mimeType, view),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ContractError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
