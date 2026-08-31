import { Plus, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listAccounts } from "@/modules/accounting/service";
import { upsertAccount, loadGhanaSmeChart } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage the chart of accounts.",
  "missing-fields": "Code, name, and type are required.",
  "code-taken": "That account code is already in use.",
};

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expense",
};

interface AccountFieldsProps {
  account?: { code: string; name: string; type: string; active: boolean; liquidityType: string; bankName: string | null; accountNumberLast4: string | null };
}

function AccountFields({ account }: AccountFieldsProps) {
  const idSuffix = account ? "-edit" : "";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`code${idSuffix}`}>Code</Label>
          <Input id={`code${idSuffix}`} name="code" defaultValue={account?.code} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`name${idSuffix}`}>Name</Label>
          <Input id={`name${idSuffix}`} name="name" defaultValue={account?.name} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`type${idSuffix}`}>Type</Label>
        <Select name="type" defaultValue={account?.type ?? "EXPENSE"} items={TYPE_LABELS}>
          <SelectTrigger id={`type${idSuffix}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Switch id={`active${idSuffix}`} name="active" defaultChecked={account?.active ?? true} />
        <Label htmlFor={`active${idSuffix}`}>Active</Label>
      </div>
      <div className="space-y-2"><Label htmlFor={`liquidityType${idSuffix}`}>Cash or bank classification</Label><select id={`liquidityType${idSuffix}`} name="liquidityType" defaultValue={account?.liquidityType ?? "NONE"} className="h-10 w-full rounded-md border bg-background px-3"><option value="NONE">Not a cash account</option><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="MOBILE_MONEY">Mobile money</option></select></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`bankName${idSuffix}`}>Institution name</Label><Input id={`bankName${idSuffix}`} name="bankName" defaultValue={account?.bankName ?? ""} /></div><div className="space-y-2"><Label htmlFor={`accountNumberLast4${idSuffix}`}>Account last 4 digits</Label><Input id={`accountNumberLast4${idSuffix}`} name="accountNumberLast4" inputMode="numeric" maxLength={4} defaultValue={account?.accountNumberLast4 ?? ""} /></div></div>
    </>
  );
}

export default async function AccountingAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; added?: string; error?: string }>;
}) {
  const { saved, added, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE);
  const accounts = await listAccounts(tenant.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Chart of Accounts" description="Every ledger account tracked for this organization." />
        {canManage ? (
          <div className="flex gap-2">
            <form action={loadGhanaSmeChart}>
              <Button type="submit" size="sm" variant="outline">
                <ListChecks />
                Load Ghana SME chart of accounts
              </Button>
            </form>
            <EntityDialog trigger={<Button size="sm"><Plus />New account</Button>} title="New account" action={upsertAccount}>
              <AccountFields />
            </EntityDialog>
          </div>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.{added !== undefined ? ` Added ${added} account${added === "1" ? "" : "s"} from the Ghana SME chart of accounts template.` : ""}
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Balance ({tenant.organization.currency})</TableHead>
            <TableHead>Status</TableHead>
            {canManage ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell className="font-mono text-xs">{account.code}</TableCell>
              <TableCell className="font-medium">
                {account.name}
                {account.isSystem ? <Badge variant="outline" className="ml-2">System</Badge> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{TYPE_LABELS[account.type]}</TableCell>
              <TableCell className="text-muted-foreground">{formatMoney(account.balance, tenant.organization.currency)}</TableCell>
              <TableCell>
                <Badge variant={account.active ? "default" : "outline"}>{account.active ? "Active" : "Inactive"}</Badge>
              </TableCell>
              {canManage ? (
                <TableCell className="text-right">
                  <EntityDialog
                    trigger={<Button size="sm" variant="ghost">Edit</Button>}
                    title="Edit account"
                    action={upsertAccount}
                    submitLabel="Save changes"
                  >
                    <input type="hidden" name="id" value={account.id} />
                    <AccountFields account={account} />
                  </EntityDialog>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
