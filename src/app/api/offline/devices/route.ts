import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { getCurrentTenant } from "@/lib/tenant";
import { resolveOfflinePolicy } from "@/lib/pwa/policy";

const registrationSchema = z.object({
  installationId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  platform: z.string().trim().min(1).max(50),
  moduleKeys: z.array(z.string().trim().min(1).max(50)).max(30),
  signingPublicKey: z.object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string().min(1).max(200),
    y: z.string().min(1).max(200),
    ext: z.boolean().optional(),
    key_ops: z.array(z.string()).optional(),
  }),
});

function tokenHash() { return createHash("sha256").update(randomUUID()).digest("hex"); }
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross-origin-request" }, { status: 403 });
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  const organization = await db.organization.findUnique({ where: { id: tenant.organizationId }, select: { metadata: true, offlineAccessGranted: true } });
  const policy = resolveOfflinePolicy(organization?.metadata);
  // Platform-gated: a platform operator must grant this organization offline
  // access before its own self-service policy can take effect at all - see
  // toggleOrganizationOfflineAccess (src/app/app/platform/actions.ts). Every
  // organization defaults to ungranted, matching this feature's own
  // documented "closed by default" release boundary.
  if (!organization?.offlineAccessGranted || !policy.enabled) return NextResponse.json({ error: "offline-disabled" }, { status: 403 });
  const moduleKeys = [...new Set(parsed.data.moduleKeys)].filter((key) => policy.moduleKeys.includes(key) && tenant.accessibleModuleKeys.includes(key));
  if (!moduleKeys.length) return NextResponse.json({ error: "module-unavailable" }, { status: 403 });
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: tenant.organizationId, userId: tenant.userId } },
    select: { id: true, status: true },
  });
  if (!membership || membership.status !== "ACTIVE") return NextResponse.json({ error: "membership-inactive" }, { status: 403 });
  const existing = await db.offlineDevice.findUnique({
    where: { organizationId_installationId: { organizationId: tenant.organizationId, installationId: parsed.data.installationId } },
  });
  if (existing && (existing.userId !== tenant.userId || existing.status === "REVOKED")) {
    return NextResponse.json({ error: "device-unavailable" }, { status: 403 });
  }
  if (!existing && await db.offlineDevice.count({ where: { organizationId: tenant.organizationId, userId: tenant.userId, status: "ACTIVE" } }) >= 5) {
    return NextResponse.json({ error: "device-limit" }, { status: 409 });
  }
  const now = new Date();
  const offlineAccessUntil = new Date(now.getTime() + policy.leaseHours * 60 * 60 * 1000);
  const tokenExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const device = existing ? await db.offlineDevice.update({
    where: { id: existing.id },
    data: { name: parsed.data.name, platform: `browser:${parsed.data.platform}`, moduleKeys, membershipId: membership.id, signingPublicKey: parsed.data.signingPublicKey, lastSeenAt: now, offlineAccessUntil, tokenExpiresAt },
  }) : await db.offlineDevice.create({
    data: { organizationId: tenant.organizationId, userId: tenant.userId, membershipId: membership.id, installationId: parsed.data.installationId, name: parsed.data.name, platform: `browser:${parsed.data.platform}`, tokenHash: tokenHash(), signingPublicKey: parsed.data.signingPublicKey, moduleKeys, lastSeenAt: now, offlineAccessUntil, tokenExpiresAt },
  });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: membership.id, module: "administration", action: existing ? "offline_browser_device.refreshed" : "offline_browser_device.registered", entityName: "OfflineDevice", entityId: device.id, metadata: { moduleKeys, platform: parsed.data.platform } });
  return NextResponse.json({ deviceId: device.id, organizationId: device.organizationId, userId: device.userId, moduleKeys: device.moduleKeys, offlineAccessUntil: device.offlineAccessUntil.toISOString(), mutationKillSwitch: policy.mutationKillSwitch });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross-origin-request" }, { status: 403 });
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const installationId = new URL(request.url).searchParams.get("installationId");
  if (!installationId) return NextResponse.json({ error: "installation-required" }, { status: 400 });
  const result = await db.offlineDevice.updateMany({
    where: { organizationId: tenant.organizationId, userId: tenant.userId, installationId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: tenant.userId },
  });
  if (!result.count) return NextResponse.json({ error: "not-found" }, { status: 404 });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "administration", action: "offline_browser_device.revoked", entityName: "OfflineDevice", entityId: installationId });
  return NextResponse.json({ ok: true });
}
