"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createManualJournalEntry, JournalNotBalancedError } from "@/modules/accounting/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createJournalEntry(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE)) {
    redirect("/app/accounting/journal?error=forbidden");
  }

  const entryDateRaw = clean(formData.get("entryDate"));
  const description = clean(formData.get("description"));
  const debitAccountId = clean(formData.get("debitAccountId"));
  const creditAccountId = clean(formData.get("creditAccountId"));
  const amount = clean(formData.get("amount"));

  if (!entryDateRaw || !description || !debitAccountId || !creditAccountId || !amount) {
    redirect("/app/accounting/journal?error=missing-fields");
  }
  if (debitAccountId === creditAccountId) {
    redirect("/app/accounting/journal?error=same-account");
  }

  const session = await getServerAuthSession();

  try {
    await createManualJournalEntry(tenant.organizationId, {
      entryDate: new Date(`${entryDateRaw}T00:00:00`),
      description,
      reference: clean(formData.get("reference")),
      createdById: session?.user?.id ?? null,
      lines: [
        { accountId: debitAccountId, debit: amount },
        { accountId: creditAccountId, credit: amount },
      ],
    });
  } catch (error) {
    if (error instanceof JournalNotBalancedError) {
      redirect("/app/accounting/journal?error=not-balanced");
    }
    throw error;
  }

  revalidatePath("/app/accounting/journal");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/journal?saved=1");
}
