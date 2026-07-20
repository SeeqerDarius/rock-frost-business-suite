import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listAccounts } from "@/modules/accounting/service";
import { upsertAccount } from "./actions";

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
  account?: { code: string; name: string; type: string; active: boolean };
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
    </>
  );
}

export default async function AccountingAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE);
  const accounts = await listAccounts(tenant.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Chart of Accounts" description="Every ledger account tracked for this organization." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New account</Button>} title="New account" action={upsertAccount}>
            <AccountFields />
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Balance</TableHead>
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
              <TableCell className="text-muted-foreground">{account.balance.toFixed(2)}</TableCell>
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
