import { Hash, Lock, Tag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getAccountingSettings, listExpenseCategories, listAccounts } from "@/modules/accounting/service";
import { addExpenseCategory, saveAccountingSettings } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Accounting settings.",
  "missing-fields": "A name is required.",
  "invalid-prefix": "Use 2-8 uppercase letters or numbers.",
};

export default async function AccountingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");

  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Accounting Settings" description="Module-wide configuration for Accounting." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Accounting settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const [categories, accounts, settings] = await Promise.all([
    listExpenseCategories(tenant.organizationId),
    listAccounts(tenant.organizationId),
    getAccountingSettings(tenant.organizationId),
  ]);
  const expenseAccountItems: Record<string, string> = Object.fromEntries(
    accounts.filter((a) => a.type === "EXPENSE").map((a) => [a.id, `${a.code} - ${a.name}`]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Accounting Settings" description="Module-wide configuration for Accounting." />

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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Hash className="size-5 text-muted-foreground" />
            <CardTitle>Invoice numbering</CardTitle>
          </div>
          <CardDescription>e.g. &quot;INV&quot; → INV-0001. Existing invoice numbers are not renumbered.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveAccountingSettings} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoiceNumberPrefix">Invoice number prefix</Label>
              <Input id="invoiceNumberPrefix" name="invoiceNumberPrefix" defaultValue={settings.invoiceNumberPrefix} minLength={2} maxLength={8} className="w-32 uppercase" required />
            </div>
            <Button type="submit" size="sm" variant="outline">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="size-5 text-muted-foreground" />
            <CardTitle>Expense categories</CardTitle>
          </div>
          <CardDescription>Used to group expenses and route them to the right ledger account when paid.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expense categories yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Badge key={category.id} variant="outline">
                  {category.name}
                  {category.expenseAccount ? ` (${category.expenseAccount.code})` : ""}
                </Badge>
              ))}
            </div>
          )}
          <form action={addExpenseCategory} className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="e.g. Utilities, Travel, Supplies" className="max-w-xs" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expenseAccountId">Ledger account</Label>
              <Select name="expenseAccountId" defaultValue="" items={{ "": "General Expenses (default)", ...expenseAccountItems }}>
                <SelectTrigger id="expenseAccountId" className="w-48">
                  <SelectValue placeholder="General Expenses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">General Expenses (default)</SelectItem>
                  {Object.entries(expenseAccountItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" variant="outline">
              Add category
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
