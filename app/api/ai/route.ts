import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/session";
import { getCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getAssistantResponse } from "@/lib/ai";
import { logAuditEvent } from "@/lib/audit";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getCurrentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "No organization access" }, { status: 403 });
  }

  if (!hasPermission(tenant, PERMISSIONS.AI_ASSISTANT_USE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question : "";

  const result = await getAssistantResponse(tenant, question);

  if (result.ok) {
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: session.user.id,
      action: "ai_assistant_query",
      entityName: "AiAssistant",
    });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
