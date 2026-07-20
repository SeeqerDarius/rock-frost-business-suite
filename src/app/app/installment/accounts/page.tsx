import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  listAccounts,
  listCustomers,
  listProducts,
  listStaff,
  resolveInstallmentStaffScope,
  getEffectiveAccountStatus,
  getInstallmentSettings,
} from "@/modules/installment/service";
import { createInstallmentAccount, markAccountDelivered, changeAccountStatus, reactivateInstallmentAccount } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage accounts.",
  "missing-fields": "Customer, product, staff, and start date are required.",
  "future-date": "Start date can't be in the future.",
  "no-stock": "That staff member has no stock left for this product.",
  "not-eligible": "This account isn't eligible for reactivation yet.",
  "below-minimum-deposit": "The initial deposit doesn't meet the required minimum.",
  "wrong-password": "Incorrect password — reactivation requires re-entering your password to confirm.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  ACTIVE: "default",
  OVERDUE: "destructive",
  COMPLETED: "default",
  DORMANT: "secondary",
  PROBATION: "secondary",
  CLOSED: "outline",
  ARCHIVED: "outline",
  SUSPENDED: "outline",
  CANCELLED: "destructive",
};

export default async function InstallmentAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE);
  const session = await getServerAuthSession();
  const isManager = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const scope = await resolveInstallmentStaffScope(tenant.organizationId, session?.user?.id ?? "", isManager);

  const [accounts, customers, products, staffList, settings] = await Promise.all([
    listAccounts(tenant.organizationId, scope.staffId),
    listCustomers(tenant.organizationId, scope.staffId),
    listProducts(tenant.organizationId),
    listStaff(tenant.organizationId),
    getInstallmentSettings(tenant.organizationId),
  ]);

  const customerItems: Record<string, string> = Object.fromEntries(customers.map((c) => [c.id, `${c.fullName} (${c.customerCode})`]));
  const activeProducts = products.filter((p) => p.active);
  const productItems: Record<string, string> = Object.fromEntries(activeProducts.map((p) => [p.id, `${p.name} — ${Number(p.price).toFixed(2)}`]));
  const staffItems: Record<string, string> = Object.fromEntries(staffList.map((s) => [s.id, `${s.fullName} (${s.code})`]));

  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Customer Accounts" description="Active and historical installment accounts." />
        {canManage && customers.length > 0 && activeProducts.length > 0 ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New account
              </Button>
            }
            title="New customer account"
            description="Creating an account reserves one unit of stock from the selected staff member's inventory."
            action={createInstallmentAccount}
          >
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer</Label>
              <Select name="customerId" items={customerItems}>
                <SelectTrigger id="customerId" className="w-full">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(customerItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="productId">Product</Label>
              <Select name="productId" items={productItems}>
                <SelectTrigger id="productId" className="w-full">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(productItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventoryStaffId">Stock from staff</Label>
              <Select name="inventoryStaffId" items={staffItems}>
                <SelectTrigger id="inventoryStaffId" className="w-full">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(staffItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={now.toISOString().slice(0, 10)} max={now.toISOString().slice(0, 10)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initialDeposit">Initial deposit (optional)</Label>
              <Input id="initialDeposit" name="initialDeposit" type="number" step="0.01" />
              {Number(settings.minimumDeposit) > 0 ? (
                <p className="text-xs text-muted-foreground">Minimum required: {Number(settings.minimumDeposit).toFixed(2)}.</p>
              ) : null}
              {Number(settings.administrationFeePercent) > 0 ? (
                <p className="text-xs text-muted-foreground">
                  A {settings.administrationFeePercent.toString()}% administration fee is added to the product price automatically.
                </p>
              ) : null}
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

      {accounts.length === 0 ? (
        <EmptyState icon={FileText} title="No accounts yet" description="Customer installment accounts will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delivery</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => {
              const effectiveStatus = getEffectiveAccountStatus(account, now);
              const canDeliver = account.status === "COMPLETED" && Number(account.balance) <= 0 && account.deliveryStatus === "PENDING";
              const canReactivate = ["DORMANT", "PROBATION", "CLOSED"].includes(account.status);
              const canSuspend = account.status === "ACTIVE";
              const canResume = account.status === "SUSPENDED";
              const canCancel = ["ACTIVE", "SUSPENDED"].includes(account.status);

              return (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.customer.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{account.product.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {Number(account.balance).toFixed(2)} / {Number(account.targetAmount).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[effectiveStatus]}>{effectiveStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{account.deliveryStatus}</TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {canDeliver ? (
                          <form action={markAccountDelivered}>
                            <input type="hidden" name="id" value={account.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Mark delivered
                            </Button>
                          </form>
                        ) : null}
                        {canReactivate ? (
                          <EntityDialog
                            trigger={
                              <Button size="sm" variant="ghost">
                                Reactivate
                              </Button>
                            }
                            title="Confirm reactivation"
                            description="A service fee will be deducted from the amount already paid. Re-enter your password to confirm."
                            action={reactivateInstallmentAccount}
                            submitLabel="Confirm reactivation"
                          >
                            <input type="hidden" name="id" value={account.id} />
                            <div className="space-y-2">
                              <Label htmlFor={`reactivate-password-${account.id}`}>Your password</Label>
                              <Input id={`reactivate-password-${account.id}`} name="confirmPassword" type="password" required />
                            </div>
                          </EntityDialog>
                        ) : null}
                        {canSuspend ? (
                          <form action={changeAccountStatus}>
                            <input type="hidden" name="id" value={account.id} />
                            <input type="hidden" name="status" value="SUSPENDED" />
                            <Button type="submit" size="sm" variant="ghost">
                              Suspend
                            </Button>
                          </form>
                        ) : null}
                        {canResume ? (
                          <form action={changeAccountStatus}>
                            <input type="hidden" name="id" value={account.id} />
                            <input type="hidden" name="status" value="ACTIVE" />
                            <Button type="submit" size="sm" variant="ghost">
                              Resume
                            </Button>
                          </form>
                        ) : null}
                        {canCancel ? (
                          <form action={changeAccountStatus}>
                            <input type="hidden" name="id" value={account.id} />
                            <input type="hidden" name="status" value="CANCELLED" />
                            <Button type="submit" size="sm" variant="ghost">
                              Cancel
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
