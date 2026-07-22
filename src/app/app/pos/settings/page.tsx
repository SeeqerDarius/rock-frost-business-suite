import { Lock, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSettings } from "@/modules/pos/service";
import { saveReceiptFooter } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage POS settings.",
  "invalid-input": "Footer text must be 5000 characters or fewer.",
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

  const settings = await getSettings(tenant.organizationId);

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
