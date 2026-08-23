import "server-only";

import { getGroqClient, SUPPORT_ASSISTANT_MODEL } from "@/lib/ai/client";
import type { AccountingInsights } from "@/modules/accounting/insights";

function money(amount: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(amount);
}

function fallbackAnswer(question: string, insights: AccountingInsights) {
  const normalized = question.toLowerCase();
  if (normalized.includes("average")) {
    return `Your average recorded revenue transaction for this period is ${money(insights.averageRevenueTransaction)}, based on ${insights.revenueTransactions} revenue transactions.`;
  }
  if (normalized.includes("cash")) {
    return `Your current recorded cash and bank balance is ${money(insights.cashBalance)}. Reconcile this against bank and cash statements before treating it as confirmed available cash.`;
  }
  if (normalized.includes("overdue") || normalized.includes("invoice")) {
    return `${insights.overdueInvoiceCount} invoices are overdue, with a recorded total of ${money(insights.overdueInvoiceTotal)}.`;
  }
  if (normalized.includes("source") || normalized.includes("module") || normalized.includes("revenue")) {
    const strongest = insights.sources[0];
    return strongest
      ? `${strongest.label} is the largest recorded revenue source in this period at ${money(strongest.amount)}. Total recorded revenue is ${money(insights.revenue)}.`
      : "No recorded revenue source is available for the selected period.";
  }
  return `For the selected period, recorded revenue is ${money(insights.revenue)}, expenses are ${money(insights.expenses)}, and net income is ${money(insights.netIncome)}. Ask about revenue sources, cash, overdue invoices, or average transaction value for a more focused answer.`;
}

export async function answerAccountingInsightQuestion(
  organizationName: string,
  question: string,
  insights: AccountingInsights,
) {
  const client = getGroqClient();
  if (!client) return fallbackAnswer(question, insights);

  try {
    const response = await client.chat.completions.create({
      model: SUPPORT_ASSISTANT_MODEL,
      max_completion_tokens: 500,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are the Rock Frost Accounting Insights assistant for ${organizationName}. Answer only from the tenant-scoped accounting figures in the supplied JSON. Do not invent causes, forecasts, tax advice, or missing records. State that figures depend on transactions recorded in the system. Keep the answer concise and practical. Never use the em dash character.`,
        },
        {
          role: "user",
          content: `Question: ${question}\n\nAccounting figures:\n${JSON.stringify(insights)}`,
        },
      ],
    });
    return response.choices[0]?.message.content?.trim() || fallbackAnswer(question, insights);
  } catch (error) {
    console.error("[ai/accounting-insights] Failed:", error);
    return fallbackAnswer(question, insights);
  }
}
