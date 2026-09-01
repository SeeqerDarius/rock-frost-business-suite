import { ScrollText, Plus, Repeat } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listJournalEntries, listAccounts, listRecurringTemplates } from "@/modules/accounting/service";
import {
  createJournalEntry,
  reverseJournalEntryAction,
  approveJournalEntryAction,
  rejectJournalEntryAction,
  createRecurringJournalTemplate,
  toggleRecurringTemplateAction,
  runRecurringTemplateNowAction,
} from "./actions";

const FREQUENCY_ITEMS: Record<string, string> = { WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" };

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to post journal entries.",
  "missing-fields": "All fields are required.",
  "same-account": "The debit and credit accounts must be different.",
  "not-balanced": "Debits and credits must be equal.",
  "not-found": "One or more of those accounts could not be found.",
  "forbidden-reversal": "You do not have permission to reverse journal entries.",
  "invalid-reversal": "That journal entry cannot be reversed.",
  "period-closed": "The reversal date is in a closed accounting period.",
  "forbidden-approval": "You do not have permission to approve journal entries.",
  "invalid-approval": "That journal entry cannot be approved. It may have already been decided, or you submitted it yourself.",
  "invalid-rejection": "That journal entry cannot be rejected. A reason is required.",
};

export default async function AccountingJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; submitted?: string; error?: string }>;
}) {
  const { saved, submitted, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE);
  const canReverse = hasPermission(tenant, PERMISSIONS.ACCOUNTING_JOURNALS_REVERSE);
  const canApprove = hasPermission(tenant, PERMISSIONS.ACCOUNTING_JOURNAL_APPROVE);
  const [entries, accounts, recurringTemplates] = await Promise.all([
    listJournalEntries(tenant.organizationId),
    listAccounts(tenant.organizationId),
    listRecurringTemplates(tenant.organizationId),
  ]);
  const accountItems: Record<string, string> = Object.fromEntries(accounts.map((a) => [a.id, `${a.code} - ${a.name}`]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Journal" description="Every posted transaction, automatic and manual." />
        {canManage ? (
          <div className="flex gap-2">
          <EntityDialog trigger={<Button size="sm" variant="outline"><Repeat />New recurring entry</Button>} title="New recurring journal entry" description="Generates automatically on the schedule below - each occurrence books on its own due date, never today's date." action={createRecurringJournalTemplate}>
            <div className="space-y-2">
              <Label htmlFor="recurring-name">Name</Label>
              <Input id="recurring-name" name="name" placeholder="e.g. Monthly rent accrual" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recurring-startDate">First run date</Label>
                <Input id="recurring-startDate" name="startDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recurring-frequency">Frequency</Label>
                <Select name="frequency" items={FREQUENCY_ITEMS} defaultValue="MONTHLY">
                  <SelectTrigger id="recurring-frequency" className="w-full">
                    <SelectValue placeholder="Select a frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_ITEMS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recurring-amount">Amount ({tenant.organization.currency})</Label>
                <Input id="recurring-amount" name="amount" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recurring-reference">Reference</Label>
                <Input id="recurring-reference" name="reference" placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-description">Description</Label>
              <Input id="recurring-description" name="description" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-debitAccountId">Debit account</Label>
              <Select name="debitAccountId" items={accountItems}>
                <SelectTrigger id="recurring-debitAccountId" className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(accountItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-creditAccountId">Credit account</Label>
              <Select name="creditAccountId" items={accountItems}>
                <SelectTrigger id="recurring-creditAccountId" className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(accountItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </EntityDialog>
          <EntityDialog trigger={<Button size="sm"><Plus />New entry</Button>} title="New manual journal entry" action={createJournalEntry}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="entryDate">Date</Label>
                <Input id="entryDate" name="entryDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ({tenant.organization.currency})</Label>
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
          </div>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {submitted ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          Submitted for approval. It will not affect account balances until an approver reviews it.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {canManage && recurringTemplates.length > 0 ? (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Recurring templates</h2>
          <div className="mt-3 space-y-2">
            {recurringTemplates.map((template) => (
              <div key={template.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm">
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{FREQUENCY_ITEMS[template.frequency]} · Next run {template.nextRunDate.toLocaleDateString()}{template.lastGeneratedAt ? ` · Last generated ${template.lastGeneratedAt.toLocaleDateString()}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={template.active ? "default" : "secondary"}>{template.active ? "Active" : "Paused"}</Badge>
                  {template.active ? (
                    <form action={runRecurringTemplateNowAction}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <Button size="sm" variant="outline" type="submit">Run now</Button>
                    </form>
                  ) : null}
                  <form action={toggleRecurringTemplateAction}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <input type="hidden" name="active" value={(!template.active).toString()} />
                    <Button size="sm" variant="outline" type="submit">{template.active ? "Pause" : "Resume"}</Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="No journal entries yet" description="Entries posted from invoices, expenses, and manual adjustments will appear here." />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium">{entry.description}</p><p className="text-xs text-muted-foreground">{entry.postingNumber} · {entry.status}</p></div>
                <p className="text-xs text-muted-foreground">{entry.entryDate.toLocaleDateString()}</p>
              </div>
              <div className="mt-2 space-y-1">
                {entry.lines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{line.account.code} - {line.account.name}</span>
                    <span>
                      {Number(line.debit) > 0 ? `Dr ${formatMoney(line.debit, tenant.organization.currency)}` : `Cr ${formatMoney(line.credit, tenant.organization.currency)}`}
                    </span>
                  </div>
                ))}
              </div>
              {entry.sourceType !== "MANUAL" ? (
                <p className="mt-3 text-xs text-muted-foreground">Managed by its source workflow. Corrections must be made in the originating module.</p>
              ) : null}
              {entry.status === "PENDING_APPROVAL" ? (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">Awaiting approval. Not yet reflected in account balances.</p>
              ) : null}
              {entry.status === "REJECTED" ? (
                <p className="mt-3 text-xs text-destructive">Rejected: {entry.rejectedReason}</p>
              ) : null}
              {canApprove && entry.status === "PENDING_APPROVAL" && entry.submittedById !== tenant.userId ? (
                <div className="mt-3 flex justify-end gap-2">
                  <form action={approveJournalEntryAction}>
                    <input type="hidden" name="id" value={entry.id} />
                    <Button size="sm" type="submit">Approve</Button>
                  </form>
                  <EntityDialog trigger={<Button size="sm" variant="outline">Reject</Button>} title="Reject journal entry" description="The entry stays in the ledger for the record, but never affects account balances." action={rejectJournalEntryAction}>
                    <input type="hidden" name="id" value={entry.id} />
                    <div className="space-y-2"><Label htmlFor={`reject-reason-${entry.id}`}>Reason</Label><Input id={`reject-reason-${entry.id}`} name="reason" required /></div>
                  </EntityDialog>
                </div>
              ) : null}
              {canReverse && entry.sourceType === "MANUAL" && entry.status === "POSTED" && !entry.reversalOfId ? <div className="mt-3 flex justify-end"><EntityDialog trigger={<Button size="sm" variant="outline">Reverse entry</Button>} title="Reverse journal entry" description="The original entry remains in the ledger. A new entry posts the opposite debit and credit lines." action={reverseJournalEntryAction}>
                <input type="hidden" name="id" value={entry.id} />
                <div className="space-y-2"><Label htmlFor={`entryDate-${entry.id}`}>Reversal date</Label><Input id={`entryDate-${entry.id}`} name="entryDate" type="date" defaultValue={today} required /></div>
                <div className="space-y-2"><Label htmlFor={`reason-${entry.id}`}>Reason</Label><Input id={`reason-${entry.id}`} name="reason" required /></div>
              </EntityDialog></div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
