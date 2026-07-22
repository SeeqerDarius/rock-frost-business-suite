import { Package, Plus, Tag, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listProducts, listProductCategories, getInstallmentSettings, getProcurementList } from "@/modules/installment/service";
import { upsertProduct, addProductCategory } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage products.",
  "missing-fields": "Name, category, cost price, daily amount, and duration are required.",
  "invalid-input": "Please check that all fields are valid (prices and duration must be positive numbers).",
  "price-floor": "Daily amount × duration cannot be lower than cost price.",
};

interface ProductFieldsProps {
  product?: {
    name: string;
    category: string;
    description: string | null;
    costPrice: string;
    transportCost: string;
    dailyAmount: string;
    duration: number;
  };
  categoryItems: Record<string, string>;
  defaultDuration: number;
  defaultDailyAmount: string;
}

function ProductFields({ product, categoryItems, defaultDuration, defaultDailyAmount }: ProductFieldsProps) {
  const idSuffix = product ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`name${idSuffix}`}>Name</Label>
        <Input id={`name${idSuffix}`} name="name" defaultValue={product?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`category${idSuffix}`}>Category</Label>
        <Select name="category" defaultValue={product?.category} items={categoryItems}>
          <SelectTrigger id={`category${idSuffix}`} className="w-full">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(categoryItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`costPrice${idSuffix}`}>Cost price</Label>
          <Input id={`costPrice${idSuffix}`} name="costPrice" type="number" step="0.01" defaultValue={product?.costPrice} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`transportCost${idSuffix}`}>Transport cost</Label>
          <Input id={`transportCost${idSuffix}`} name="transportCost" type="number" step="0.01" defaultValue={product?.transportCost ?? "0"} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`dailyAmount${idSuffix}`}>Daily amount</Label>
          <Input id={`dailyAmount${idSuffix}`} name="dailyAmount" type="number" step="0.01" defaultValue={product?.dailyAmount ?? defaultDailyAmount} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`duration${idSuffix}`}>Duration (days)</Label>
          <Input
            id={`duration${idSuffix}`}
            name="duration"
            type="number"
            defaultValue={product?.duration ?? defaultDuration}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Price is calculated automatically as daily amount × duration, and must be at least the cost price.</p>
      <div className="space-y-2">
        <Label htmlFor={`description${idSuffix}`}>Description</Label>
        <Textarea id={`description${idSuffix}`} name="description" defaultValue={product?.description ?? ""} rows={3} />
      </div>
    </>
  );
}

export default async function InstallmentProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("installment");
  const canManage = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const [products, categories, settings, procurementList] = await Promise.all([
    listProducts(tenant.organizationId),
    listProductCategories(tenant.organizationId),
    getInstallmentSettings(tenant.organizationId),
    canManage ? getProcurementList(tenant.organizationId) : Promise.resolve([]),
  ]);
  const categoryItems: Record<string, string> = Object.fromEntries(categories.map((c) => [c.name, c.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Products" description="Products available for installment sale." />
        {canManage && categories.length > 0 ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New product
              </Button>
            }
            title="New product"
            action={upsertProduct}
          >
            <ProductFields categoryItems={categoryItems} defaultDuration={settings.installmentDurationDays} defaultDailyAmount={settings.defaultDailyCollection.toString()} />
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

      {canManage ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="size-5 text-muted-foreground" />
              <CardTitle>Categories</CardTitle>
            </div>
            <CardDescription>{categories.map((c) => c.name).join(", ") || "No categories yet."}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addProductCategory} className="flex gap-2">
              <Input name="categoryName" placeholder="New category name" className="max-w-xs" />
              <Button type="submit" size="sm" variant="outline">
                Add category
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Truck className="size-5 text-muted-foreground" />
              <CardTitle>Procurement</CardTitle>
            </div>
            <CardDescription>
              Products where enough customers have paid past the procurement threshold ({settings.procurementThresholdPercent.toString()}%) to be worth restocking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {procurementList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing ready for procurement yet.</p>
            ) : (
              <div className="space-y-2">
                {procurementList.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} unit{item.quantity === 1 ? "" : "s"} · avg {(item.averageProgress * 100).toFixed(0)}% paid · est. cost {item.totalCost.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {products.length === 0 ? (
        <EmptyState icon={Package} title="No products yet" description="Products you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Daily / Duration</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="text-muted-foreground">{product.category}</TableCell>
                <TableCell className="text-muted-foreground">{Number(product.price).toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {Number(product.dailyAmount).toFixed(2)} × {product.duration}d
                </TableCell>
                <TableCell>
                  <Badge variant={product.active ? "default" : "outline"}>{product.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit product"
                      action={upsertProduct}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={product.id} />
                      <ProductFields
                        product={{
                          ...product,
                          costPrice: product.costPrice.toString(),
                          transportCost: product.transportCost.toString(),
                          dailyAmount: product.dailyAmount.toString(),
                        }}
                        categoryItems={categoryItems}
                        defaultDuration={settings.installmentDurationDays}
                        defaultDailyAmount={settings.defaultDailyCollection.toString()}
                      />
                    </EntityDialog>
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
