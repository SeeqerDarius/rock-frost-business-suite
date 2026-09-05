import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { cn } from "@/lib/utils";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getReconciliation, listBankStatementLines, suggestReconciliationMatches } from "@/modules/accounting/service";
import { FileClock } from "lucide-react";
import { importBankStatementLinesAction, confirmMatchAction, ignoreLineAction, completeDraftReconciliationAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage reconciliations.",
  "missing-file": "Choose a CSV file to import.",
  "file-too-large": "That file is larger than 2 MB.",
  "invalid-csv": "That file could not be read as CSV.",
  "unrecognized-columns": "Couldn't find a date, description, and amount (or debit/credit) column in that file's header row.",
  "no-valid-rows": "No valid rows were found in that file.",
  "not-found": "That record could not be found.",
  "not-draft": "This reconciliation is no longer a draft.",
  "already-decided": "That statement line has already been matched or ignored.",
  "missing-fields": "All fields are required.",
};

export default async function ReconciliationWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ reconciliationId: string }>;
  searchParams: Promise<{ saved?: string; imported?: string; error?: string }>;
}) {
  const { reconciliationId } = await params;
  const { saved, imported, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECONCILIATIONS_MANAGE)) {
    redirect("/app/accounting/cashbook?error=forbidden");
  }

  const reconciliation = await getReconciliation(tenant.organizationId, reconciliationId);
  if (!reconciliation) redirect("/app/accounting/cashbook?error=not-found");

  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, tenant.organization.currency);

  if (reconciliation.status !== "DRAFT") {
    return (
      <div className="space-y-6">
        <PageHeader title="Reconciliation" description={`${reconciliation.account.name} · ${reconciliation.periodEnd.toLocaleDateString()}`} />
        <div className="rounded-xl border p-5 text-sm">
          This reconciliation is already {reconciliation.status.toLowerCase()}. Difference: {money(reconciliation.difference)}.
        </div>
        <Link href="/app/accounting/cashbook" className={cn(buttonVariants({ variant: "outline" }))}>Back to cash and bank</Link>
      </div>
    );
  }

  const [lines, suggestions] = await Promise.all([
    listBankStatementLines(tenant.organizationId, reconciliationId),
    suggestReconciliationMatches(tenant.organizationId, reconciliationId),
  ]);
  const suggestionByStatementLine = new Map(suggestions.map((s) => [s.statementLineId, s]));
  const unmatched = lines.filter((line) => line.status === "UNMATCHED");
  const decided = lines.filter((line) => line.status !== "UNMATCHED");

  return (
    <div className="space-y-6">
      <PageHeader title="Reconciliation" description={`${reconciliation.account.name} · ${reconciliation.periodStart.toLocaleDateString()} - ${reconciliation.periodEnd.toLocaleDateString()}`} />

      {saved || imported ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">{imported ? "Statement imported." : "Saved."}</p> : null}
      {error && ERROR_MESSAGES[error] ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{ERROR_MESSAGES[error]}</p> : null}

      <form action={importBankStatementLinesAction} className="space-y-3 rounded-xl border p-5" encType="multipart/form-data">
        <input type="hidden" name="reconciliationId" value={reconciliationId} />
        <h2 className="font-semibold">Import bank statement</h2>
        <p className="text-sm text-muted-foreground">A CSV with a date, description, and amount column (or separate debit/credit columns). Header names are matched automatically - re-uploading the same file will not create duplicate lines.</p>
        <Input type="file" name="file" accept=".csv,text/csv" required />
        <Button type="submit">Upload</Button>
      </form>

      {lines.length === 0 ? (
        <EmptyState icon={FileClock} title="No statement lines yet" description="Import a CSV export of this account's bank statement to begin matching." />
      ) : (
        <>
          <section className="rounded-xl border p-5">
            <h2 className="font-semibold">Unmatched ({unmatched.length})</h2>
            <div className="mt-3 space-y-3">
              {unmatched.length === 0 ? <p className="text-sm text-muted-foreground">Every imported line has been matched or ignored.</p> : null}
              {unmatched.map((line) => {
                const suggestion = suggestionByStatementLine.get(line.id);
                return (
                  <div key={line.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span>{line.date.toLocaleDateString()} · {line.description}</span>
                      <span className={Number(line.amount) >= 0 ? "text-emerald-600" : "text-destructive"}>{money(line.amount)}</span>
                    </div>
                    {suggestion ? (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                        <span className="text-xs text-muted-foreground">Suggested match: {suggestion.postingNumber} · {suggestion.journalEntryDescription} ({suggestion.journalEntryDate.toLocaleDateString()})</span>
                        <form action={confirmMatchAction}>
                          <input type="hidden" name="reconciliationId" value={reconciliationId} />
                          <input type="hidden" name="statementLineId" value={line.id} />
                          <input type="hidden" name="journalLineId" value={suggestion.journalLineId} />
                          <Button size="sm" type="submit">Confirm match</Button>
                        </form>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">No suggested ledger match found.</p>
                    )}
                    <form action={ignoreLineAction} className="mt-2 flex justify-end">
                      <input type="hidden" name="reconciliationId" value={reconciliationId} />
                      <input type="hidden" name="statementLineId" value={line.id} />
                      <Button size="sm" variant="outline" type="submit">Ignore</Button>
                    </form>
                  </div>
                );
              })}
            </div>
          </section>

          {decided.length > 0 ? (
            <section className="rounded-xl border p-5">
              <h2 className="font-semibold">Decided</h2>
              <div className="mt-3 space-y-2">
                {decided.map((line) => (
                  <div key={line.id} className="flex items-center justify-between border-b py-2 text-sm">
                    <span>{line.date.toLocaleDateString()} · {line.description} · {money(line.amount)}</span>
                    <Badge variant={line.status === "MATCHED" ? "default" : "secondary"}>
                      {line.status === "MATCHED" ? `Matched · ${line.matchedJournalLine?.journalEntry.postingNumber}` : "Ignored"}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <form action={completeDraftReconciliationAction} className="space-y-4 rounded-xl border p-5">
        <input type="hidden" name="reconciliationId" value={reconciliationId} />
        <h2 className="font-semibold">Complete reconciliation</h2>
        <p className="text-sm text-muted-foreground">Unmatched lines stay visible in the ledger history but don&apos;t block completion - resolve them by posting a missing entry or by ignoring a bank-only item.</p>
        <div>
          <Label>Statement closing balance ({tenant.organization.currency})</Label>
          <Input name="statementBalance" type="number" step="0.01" required />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea name="notes" />
        </div>
        <Button type="submit">Complete reconciliation</Button>
      </form>
    </div>
  );
}
