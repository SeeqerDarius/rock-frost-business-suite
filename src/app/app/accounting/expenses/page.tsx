import { Receipt, Plus } from "lucide-react";
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
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listExpenses, listExpenseCategories } from "@/modules/accounting/service";
import { createNewExpense, approveExistingExpense, rejectExistingExpense, payExistingExpense } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage expenses.",
  "missing-fields": "All required fields must be filled in.",
  "invalid-state": "That action isn't valid for this expense's current status.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  PENDING: "outline",
  APPROVED: "secondary",
  PAID: "default",
  REJECTED: "destructive",
};

export default async function AccountingExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE);
  const [expenses, categories] = await Promise.all([
    listExpenses(tenant.organizationId),
    listExpenseCategories(tenant.organizationId),
  ]);
  const categoryItems: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Expenses" description="Amounts your organization owes or has paid to vendors." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New expense</Button>} title="New expense" action={createNewExpense}>
            <div className="space-y-2">
              <Label htmlFor="vendorName">Vendor name</Label>
              <Input id="vendorName" name="vendorName" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="categoryId">Category</Label>
                <Select name="categoryId" defaultValue="" items={{ "": "None", ...categoryItems }}>
                  <SelectTrigger id="categoryId" className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {Object.entries(categoryItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expenseDate">Expense date</Label>
              <Input id="expenseDate" name="expenseDate" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} />
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

      {expenses.length === 0 ? (
        <EmptyState icon={Receipt} title="No expenses yet" description="Expenses you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="font-mono text-xs">{expense.expenseNumber}</TableCell>
                <TableCell className="font-medium">{expense.vendorName}</TableCell>
                <TableCell className="text-muted-foreground">{expense.category?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{Number(expense.amount).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[expense.status]}>{expense.status}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {expense.status === "PENDING" ? (
                        <>
                          <form action={approveExistingExpense}>
                            <input type="hidden" name="id" value={expense.id} />
                            <Button type="submit" size="sm" variant="ghost">Approve</Button>
                          </form>
                          <form action={rejectExistingExpense}>
                            <input type="hidden" name="id" value={expense.id} />
                            <Button type="submit" size="sm" variant="ghost">Reject</Button>
                          </form>
                        </>
                      ) : null}
                      {expense.status === "APPROVED" ? (
                        <EntityDialog
                          trigger={<Button size="sm" variant="ghost">Pay</Button>}
                          title={`Pay ${expense.expenseNumber}`}
                          action={payExistingExpense}
                          submitLabel="Record payment"
                        >
                          <input type="hidden" name="id" value={expense.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`pay-date-${expense.id}`}>Payment date</Label>
                            <Input id={`pay-date-${expense.id}`} name="paymentDate" type="date" defaultValue={today} required />
                          </div>
                        </EntityDialog>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
