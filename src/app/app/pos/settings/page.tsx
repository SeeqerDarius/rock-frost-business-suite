import { Hash, Lock, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSaleNumberPrefix, getSettings } from "@/modules/pos/service";
import { saveReceiptFooter, saveSaleNumberPrefix } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage POS settings.",
  "invalid-input": "Footer text must be 5000 characters or fewer.",
  "invalid-prefix": "Use 2-8 uppercase letters or numbers.",
};

export default async function PosSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("pos");

  if (!hasPermission(tenant, PERMISSIONS.POS_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="POS Settings" description="Module-wide configuration for Point of Sale." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="POS settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const [settings, saleNumberPrefix] = await Promise.all([
    getSettings(tenant.organizationId),
    getSaleNumberPrefix(tenant.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="POS Settings" description="Module-wide configuration for Point of Sale." />

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
            <CardTitle>Sale numbering</CardTitle>
          </div>
          <CardDescription>e.g. &quot;SALE&quot; → SALE-00001. Existing sale numbers are not renumbered.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveSaleNumberPrefix} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="saleNumberPrefix">Sale number prefix</Label>
              <Input id="saleNumberPrefix" name="saleNumberPrefix" defaultValue={saleNumberPrefix} minLength={2} maxLength={8} className="w-32 uppercase" required />
            </div>
            <Button type="submit" size="sm" variant="outline">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ReceiptText className="size-5 text-muted-foreground" />
            <CardTitle>Receipt footer</CardTitle>
          </div>
          <CardDescription>Shown at the bottom of every receipt.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveReceiptFooter} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="receiptFooterText">Footer text</Label>
              <Textarea id="receiptFooterText" name="receiptFooterText" rows={3} defaultValue={settings.receiptFooterText ?? ""} placeholder="e.g. Thank you for your business!" />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
