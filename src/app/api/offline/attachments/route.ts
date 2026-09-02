import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { getCurrentTenant } from "@/lib/tenant";
import { verifyOfflineRequestSignature } from "@/lib/pwa/signed-request";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const bodySchema = z.object({
  deviceId: z.string().min(1).max(100),
  clientId: z.string().uuid(),
  module: z.string().min(1).max(50),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  data: z.string().min(1).max(Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 100),
});

function hasValidSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross-origin-request" }, { status: 403 });
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rawBody = await request.text();
  const parsed = bodySchema.safeParse((() => { try { return JSON.parse(rawBody); } catch { return null; } })());
  if (!parsed.success) return NextResponse.json({ error: "invalid-attachment" }, { status: 400 });
  const device = await db.offlineDevice.findFirst({ where: { id: parsed.data.deviceId, organizationId: tenant.organizationId, userId: tenant.userId, status: "ACTIVE" } });
  if (!device || !device.moduleKeys.includes(parsed.data.module) || !tenant.accessibleModuleKeys.includes(parsed.data.module)) return NextResponse.json({ error: "access-revoked" }, { status: 403 });
  if (!await verifyOfflineRequestSignature(request, rawBody, device.signingPublicKey)) return NextResponse.json({ error: "invalid-device-signature" }, { status: 403 });
  if (device.tokenExpiresAt <= new Date() || device.offlineAccessUntil <= new Date()) return NextResponse.json({ error: "offline-lease-expired" }, { status: 403 });
  const bytes = Buffer.from(parsed.data.data, "base64");
  if (bytes.length !== parsed.data.size || !hasValidSignature(bytes, parsed.data.mimeType)) return NextResponse.json({ error: "invalid-file-signature" }, { status: 400 });
  await db.offlineAttachmentUpload.deleteMany({ where: { organizationId: tenant.organizationId, OR: [{ expiresAt: { lt: new Date() } }, { status: "CONSUMED", consumedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] } });
  const attachment = await db.offlineAttachmentUpload.upsert({
    where: { organizationId_clientId: { organizationId: tenant.organizationId, clientId: parsed.data.clientId } },
    update: {},
    create: {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      deviceId: device.id,
      clientId: parsed.data.clientId,
      moduleKey: parsed.data.module,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      data: bytes,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: parsed.data.module, action: "offline_attachment.staged", entityName: "OfflineAttachmentUpload", entityId: attachment.id, metadata: { mimeType: attachment.mimeType, size: attachment.size, sha256: attachment.sha256 } });
  return NextResponse.json({ attachmentId: attachment.id, status: "staged" });
}
