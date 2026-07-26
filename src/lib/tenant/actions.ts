"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";
import { ACTIVE_ORG_COOKIE, ACTIVE_ORGANIZATION_STATUSES } from "@/lib/tenant";
import { cuid, parseWithSchema } from "@/lib/validation";
import { findPlatformMembership } from "@/lib/auth/platform-identity";

export async function switchOrganization(formData: FormData): Promise<void> {
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  if (!userId) {
    return;
  }

  const platformMembership = await findPlatformMembership(userId);
  if (platformMembership) {
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_ORG_COOKIE);
    redirect("/app/platform/dashboard");
  }

  const parsedOrgId = parseWithSchema(cuid, String(formData.get("organizationId") ?? "").trim());
  if (!parsedOrgId.success) {
    return;
  }
  const organizationId = parsedOrgId.data;

  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE" },
    include: { organization: true },
  });

  if (!membership || !ACTIVE_ORGANIZATION_STATUSES.has(membership.organization.status)) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/app/dashboard");
}
