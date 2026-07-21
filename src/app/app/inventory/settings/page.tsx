import { Lock, Tag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listCategories } from "@/modules/inventory/service";
import { addCategory } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Inventory settings.",
  "missing-fields": "A name is required.",
};

export default async function InventorySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Inventory Settings" description="Module-wide configuration for Inventory." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Inventory settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const categories = await listCategories(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory Settings" description="Module-wide configuration for Inventory." />

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
            <Tag className="size-5 text-muted-foreground" />
            <CardTitle>Item categories</CardTitle>
          </div>
          <CardDescription>Used to group items; shown as a dropdown when creating a new item.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Badge key={category.id} variant="outline">
                  {category.name}
                </Badge>
              ))}
            </div>
          )}
          <form action={addCategory} className="flex gap-2">
            <Label htmlFor="name" className="sr-only">
              New category name
            </Label>
            <Input id="name" name="name" placeholder="e.g. Electronics, Furniture, Spare parts" className="max-w-xs" />
            <Button type="submit" size="sm" variant="outline">
              Add category
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
