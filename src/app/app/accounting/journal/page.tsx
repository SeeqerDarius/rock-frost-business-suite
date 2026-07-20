import { ScrollText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listJournalEntries, listAccounts } from "@/modules/accounting/service";
import { createJournalEntry } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to post journal entries.",
  "missing-fields": "All fields are required.",
  "same-account": "The debit and credit accounts must be different.",
  "not-balanced": "Debits and credits must be equal.",
};

export default async function AccountingJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE);
  const [entries, accounts] = await Promise.all([
    listJournalEntries(tenant.organizationId),
    listAccounts(tenant.organizationId),
  ]);
  const accountItems: Record<string, string> = Object.fromEntries(accounts.map((a) => [a.id, `${a.code} — ${a.name}`]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Journal" description="Every posted transaction — automatic and manual." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New entry</Button>} title="New manual journal entry" action={createJournalEntry}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="entryDate">Date</Label>
                <Input id="entryDate" name="entryDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="debitAccountId">Debit account</Label>
              <Select name="debitAccountId" items={accountItems}>
                <SelectTrigger id="debitAccountId" className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(accountItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditAccountId">Credit account</Label>
              <Select name="creditAccountId" items={accountItems}>
                <SelectTrigger id="creditAccountId" className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(accountItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" name="reference" placeholder="Optional" />
            </div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="No journal entries yet" description="Entries posted from invoices, expenses, and manual adjustments will appear here." />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{entry.description}</p>
                <p className="text-xs text-muted-foreground">{entry.entryDate.toLocaleDateString()}</p>
              </div>
              <div className="mt-2 space-y-1">
                {entry.lines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{line.account.code} — {line.account.name}</span>
                    <span>
                      {Number(line.debit) > 0 ? `Dr ${Number(line.debit).toFixed(2)}` : `Cr ${Number(line.credit).toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
