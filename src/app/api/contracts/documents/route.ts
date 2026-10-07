import { NextResponse } from "next/server";
import type { ContractDocumentType } from "@prisma/client";
import { getCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";
import { PrivateFileError } from "@/lib/storage/private-files";
import { CONTRACTS_FLASH_COOKIE, CONTRACTS_FLASH_PATH } from "@/modules/contracts/flash";
import { actorFromTenant, ContractError, uploadContractDocument } from "@/modules/contracts/service";

const DOCUMENT_TYPES: ContractDocumentType[] = ["PRIMARY", "SUPPORTING", "AMENDMENT", "ADDENDUM", "SCHEDULE", "EXHIBIT", "EVIDENCE", "CERTIFICATE", "OTHER"];

/**
 * Contract document upload. A route handler (not a Server Action) so a file
 * up to the 4 MB limit fits; Server Actions are capped at 2 MB. The
 * organization and permissions come only from the session, and cross-site
 * submissions are refused.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(tenant, "contracts")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const contractId = String(formData.get("contractId") ?? "");
  if (!/^[a-z0-9]{10,40}$/.test(contractId)) return NextResponse.json({ error: "Invalid contract" }, { status: 400 });
  const back = new URL(`/app/contracts/${contractId}?tab=documents`, request.url);
  const file = formData.get("file");
  const documentType = String(formData.get("documentType") ?? "SUPPORTING") as ContractDocumentType;
  const response = (query: string) => NextResponse.redirect(new URL(`${back.pathname}${back.search}&${query}`, request.url), 303);
  try {
    if (!(file instanceof File)) throw new ContractError("Choose a file to upload.");
    if (!DOCUMENT_TYPES.includes(documentType)) throw new ContractError("Choose a document type.");
    await uploadContractDocument(actorFromTenant(tenant), contractId, {
      documentType,
      title: String(formData.get("title") ?? ""),
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  } catch (error) {
    if (error instanceof ContractError || error instanceof PrivateFileError) {
      const redirect = response("error=1");
      redirect.cookies.set(CONTRACTS_FLASH_COOKIE, error.message.slice(0, 240), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: CONTRACTS_FLASH_PATH, maxAge: 30 });
      return redirect;
    }
    throw error;
  }
  return response("saved=1");
}
