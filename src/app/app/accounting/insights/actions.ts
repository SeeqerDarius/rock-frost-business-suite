"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { answerAccountingInsightQuestion } from "@/lib/ai/accounting-insights";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getServerAuthSession } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit";
import { getAccountingInsights } from "@/modules/accounting/insights";

export interface AccountingInsightAssistantState {
  answer: string | null;
  error: string | null;
}

const schema = z.object({
  question: z.string().trim().min(3).max(500),
  period: z.coerce.number().pipe(z.union([z.literal(30), z.literal(90), z.literal(365)])),
});

export async function askAccountingInsights(
  _previous: AccountingInsightAssistantState,
  formData: FormData,
): Promise<AccountingInsightAssistantState> {
  const tenant = await requireModuleAccess("accounting");
  if (
    !hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW) ||
    !hasPermission(tenant, PERMISSIONS.AI_ASSISTANT_USE)
  ) {
    return { answer: null, error: "You do not have permission to use Accounting Insights." };
  }

  const parsed = schema.safeParse({ question: formData.get("question"), period: formData.get("period") });
  if (!parsed.success) return { answer: null, error: "Enter a clear business question." };

  const session = await getServerAuthSession();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const usage = await db.auditLog.count({
    where: {
      organizationId: tenant.organizationId,
      userId: session?.user?.id ?? undefined,
      module: "accounting",
      action: "insights.asked",
      createdAt: { gte: oneHourAgo },
    },
  });
  if (usage >= 30) return { answer: null, error: "The hourly Insights limit has been reached. Try again later." };

  const insights = await getAccountingInsights(tenant.organizationId, parsed.data.period);
  const answer = await answerAccountingInsightQuestion(tenant.organization.name, parsed.data.question, insights);
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id ?? null,
    module: "accounting",
    action: "insights.asked",
    entityName: "AccountingInsights",
    metadata: { periodDays: parsed.data.period },
  });
  return { answer, error: null };
}
