import { Wallet, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listPettyCashFunds, listExpenseCategories } from "@/modules/accounting/service";
import { createFundAction, recordExpenseAction, replenishFundAction, closeFundAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage petty cash.",
  "missing-fields": "All required fields must be filled in.",
  "invalid-state": "That action isn't valid for this fund's current status.",
  "invalid-amount": "That amount isn't valid, or exceeds what's available.",
  "not-found": "That petty cash fund could not be found.",
};

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_CASHBOOK_MANAGE);
  const [funds, categories] = await Promise.all([
    listPettyCashFunds(tenant.organizationId),
    listExpenseCategories(tenant.organizationId),
  ]);
  const categoryItems: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Petty cash" description="Imprest cash floats issued to custodians, expenses recorded against them, and replenishment back to the float." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New fund</Button>} title="Set up a petty cash fund" action={createFundAction}>
            <div className="space-y-2">
              <Label htmlFor="name">Fund name</Label>
              <Input id="name" name="name" placeholder="Front desk, Site office…" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custodianName">Custodian</Label>
              <Input id="custodianName" name="custodianName" placeholder="Who holds this float" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floatAmount">Float amount</Label>
              <Input id="floatAmount" name="floatAmount" type="number" step="0.01" required />
              <p className="text-xs text-muted-foreground">Issued from the main Cash account and posted as a journal entry.</p>
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

      {funds.length === 0 ? (
        <EmptyState icon={Wallet} title="No petty cash funds yet" description="Set up a fund to track a small cash float handed to a custodian for day-to-day incidentals." />
      ) : (
        <div className="space-y-6">
          {funds.map((fund) => (
            <div key={fund.id} className="space-y-4 rounded-xl border p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{fund.name}</h2>
                    <Badge variant={fund.status === "ACTIVE" ? "default" : "secondary"}>{fund.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Custodian: {fund.custodianName} · Account {fund.account.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Current balance / float</p>
                  <p className="text-2xl font-semibold">{fund.balance.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">/ {Number(fund.floatAmount).toFixed(2)}</span></p>
                </div>
              </div>

              {canManage && fund.status === "ACTIVE" ? (
                <div className="flex flex-wrap gap-2">
                  <EntityDialog trigger={<Button size="sm" variant="outline">Record expense</Button>} title={`Record an expense against ${fund.name}`} action={recordExpenseAction} submitLabel="Record expense">
                    <input type="hidden" name="fundId" value={fund.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`expense-category-${fund.id}`}>Category</Label>
                        <Select name="expenseCategoryId" defaultValue="" items={{ "": "None", ...categoryItems }}>
                          <SelectTrigger id={`expense-category-${fund.id}`} className="w-full">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {Object.entries(categoryItems).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`expense-amount-${fund.id}`}>Amount</Label>
                        <Input id={`expense-amount-${fund.id}`} name="amount" type="number" step="0.01" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`expense-description-${fund.id}`}>What was it for</Label>
                      <Input id={`expense-description-${fund.id}`} name="description" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`expense-date-${fund.id}`}>Date</Label>
                      <Input id={`expense-date-${fund.id}`} name="expenseDate" type="date" defaultValue={today} />
                    </div>
                  </EntityDialog>

                  <EntityDialog trigger={<Button size="sm" variant="outline">Replenish</Button>} title={`Replenish ${fund.name}`} description="Leave the amount blank to top the fund back up to its full float automatically." action={replenishFundAction} submitLabel="Replenish">
                    <input type="hidden" name="fundId" value={fund.id} />
                    <div className="space-y-2">
                      <Label htmlFor={`replenish-amount-${fund.id}`}>Amount</Label>
                      <Input id={`replenish-amount-${fund.id}`} name="amount" type="number" step="0.01" placeholder={`Auto: ${(Number(fund.floatAmount) - fund.balance).toFixed(2)}`} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`replenish-notes-${fund.id}`}>Notes</Label>
                      <Textarea id={`replenish-notes-${fund.id}`} name="description" rows={2} />
                    </div>
                  </EntityDialog>

                  <EntityDialog trigger={<Button size="sm" variant="ghost">Close fund</Button>} title={`Close ${fund.name}`} description="Any remaining float is returned to the main Cash account and the fund is closed." action={closeFundAction} submitLabel="Close fund">
                    <input type="hidden" name="fundId" value={fund.id} />
                  </EntityDialog>
                </div>
              ) : null}

              {fund.transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fund.transactions.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="text-muted-foreground">{txn.createdAt.toLocaleDateString()}</TableCell>
                        <TableCell><Badge variant="outline">{txn.type}</Badge></TableCell>
                        <TableCell>{txn.description}{txn.expenseCategory ? <span className="block text-xs text-muted-foreground">{txn.expenseCategory.name}</span> : null}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{Number(txn.amount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
