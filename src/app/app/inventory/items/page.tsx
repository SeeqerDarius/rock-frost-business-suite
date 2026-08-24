import Image from "next/image";
import { ImageIcon, Package, Plus } from "lucide-react";
import type { InventoryProductType } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
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
import { listItems, listCategories, getInventorySettings } from "@/modules/inventory/service";
import { listTaxCodes } from "@/modules/accounting/tax-service";
import { upsertItem } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage items.",
  "missing-fields": "SKU, name, and cost price are required.",
  "sku-taken": "That SKU is already in use by another item.",
  "barcode-taken": "That barcode is already assigned to another item.",
  "not-found": "That category or tax code could not be found.",
  "invalid-image": "Choose a valid JPG, PNG, or WebP image no larger than 1 MB.",
};

function ToggleField({ name, title, description, defaultChecked }: { name: string; title: string; description: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-primary" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

interface ItemFieldsProps {
  item?: {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    imageData: string | null;
    categoryId: string | null;
    unit: string;
    costPrice: string;
    salesPrice: string;
    taxCodeId: string | null;
    productType: InventoryProductType;
    trackInventory: boolean;
    isPosAvailable: boolean;
    isPurchasable: boolean;
    reorderPoint: number;
    active: boolean;
    onHand?: number;
  };
  categoryItems: Record<string, string>;
  taxCodeItems: Record<string, string>;
  /** Only applied for a brand-new item — set on Inventory Settings ("Default reorder point for new items"). */
  defaultReorderPoint?: number;
}

function ItemFields({ item, categoryItems, taxCodeItems, defaultReorderPoint = 0 }: ItemFieldsProps) {
  const idSuffix = item ? "-edit" : "";
  const trackInventory = item?.trackInventory ?? true;
  return (
    <>
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">General</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`sku${idSuffix}`}>SKU / reference</Label>
            <Input id={`sku${idSuffix}`} name="sku" defaultValue={item?.sku} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`name${idSuffix}`}>Name</Label>
            <Input id={`name${idSuffix}`} name="name" defaultValue={item?.name} required />
          </div>
        </div>
        <div className="space-y-2"><Label htmlFor={`barcode${idSuffix}`}>Barcode</Label><Input id={`barcode${idSuffix}`} name="barcode" defaultValue={item?.barcode ?? ""} placeholder="Optional manufacturer or internal barcode" /></div>
        <div className="space-y-2">
          <Label htmlFor={`image${idSuffix}`}>{item?.imageData ? "Replace item image" : "Item image"}</Label>
          {item?.imageData ? <div className="flex items-center gap-3 rounded-md border p-2"><Image src={`/api/inventory/items/${item.id}/image`} alt={`${item.name} item`} width={56} height={56} unoptimized className="size-14 rounded-md object-cover" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeImage" />Remove current image</label></div> : null}
          <Input id={`image${idSuffix}`} name="image" type="file" accept="image/jpeg,image/png,image/webp" />
          <p className="text-xs text-muted-foreground">Optional JPG, PNG, or WebP, up to 1 MB.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`categoryId${idSuffix}`}>Category</Label>
            <Select name="categoryId" defaultValue={item?.categoryId ?? ""} items={{ "": "None", ...categoryItems }}>
              <SelectTrigger id={`categoryId${idSuffix}`} className="w-full">
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
            <Label htmlFor={`unit${idSuffix}`}>Unit</Label>
            <Input id={`unit${idSuffix}`} name="unit" defaultValue={item?.unit ?? "unit"} placeholder="e.g. unit, box, kg" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch id={`active${idSuffix}`} name="active" defaultChecked={item?.active ?? true} />
          <Label htmlFor={`active${idSuffix}`}>Active</Label>
        </div>
      </section>

      <section className="space-y-3 border-t pt-4">
        <div>
          <h2 className="text-sm font-semibold">Type &amp; availability</h2>
          <p className="text-xs text-muted-foreground">What kind of product this is, and where it can be sold or bought.</p>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="productType" value="GOODS" defaultChecked={(item?.productType ?? "GOODS") === "GOODS"} />Goods</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="productType" value="SERVICE" defaultChecked={item?.productType === "SERVICE"} />Service</label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleField name="trackInventory" title="Track inventory" description="Keep a stock quantity for this item. Turn off for a service or fee with nothing to count." defaultChecked={item?.trackInventory ?? true} />
          <ToggleField name="isPosAvailable" title="Available in POS" description="Show this item in the register's product grid." defaultChecked={item?.isPosAvailable ?? true} />
          <ToggleField name="isPurchasable" title="Purchasable" description="Allow this item on Procurement requests and orders." defaultChecked={item?.isPurchasable ?? true} />
        </div>
      </section>

      <section className="space-y-4 border-t pt-4">
        <div>
          <h2 className="text-sm font-semibold">Pricing &amp; tax</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`costPrice${idSuffix}`}>Cost price</Label>
            <Input id={`costPrice${idSuffix}`} name="costPrice" type="number" step="0.01" defaultValue={item?.costPrice ?? "0"} required />
            <p className="text-xs text-muted-foreground">What you pay to acquire it.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`salesPrice${idSuffix}`}>Sales price</Label>
            <Input id={`salesPrice${idSuffix}`} name="salesPrice" type="number" step="0.01" defaultValue={item?.salesPrice ?? "0"} />
            <p className="text-xs text-muted-foreground">What POS sells it for.</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`taxCodeId${idSuffix}`}>Sales tax</Label>
          <select id={`taxCodeId${idSuffix}`} name="taxCodeId" defaultValue={item?.taxCodeId ?? ""} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
            <option value="">No tax</option>
            {Object.entries(taxCodeItems).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-4 border-t pt-4">
        <div>
          <h2 className="text-sm font-semibold">Stock</h2>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`reorderPoint${idSuffix}`}>Reorder point</Label>
          <Input id={`reorderPoint${idSuffix}`} name="reorderPoint" type="number" defaultValue={item?.reorderPoint ?? defaultReorderPoint} disabled={!trackInventory} />
        </div>
        {item && trackInventory ? (
          <p className="text-xs text-muted-foreground">{item.onHand ?? 0} {item.unit} on hand across all warehouses. Adjust stock from the Stock and Movements pages.</p>
        ) : null}
      </section>
    </>
  );
}

export default async function InventoryItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("inventory");
  const canManage = hasPermission(tenant, PERMISSIONS.INVENTORY_ITEMS_MANAGE);
  const [items, categories, settings, taxCodes] = await Promise.all([
    listItems(tenant.organizationId),
    listCategories(tenant.organizationId),
    getInventorySettings(tenant.organizationId),
    listTaxCodes(tenant.organizationId),
  ]);
  const categoryItems: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const taxCodeItems: Record<string, string> = Object.fromEntries(
    taxCodes.filter((code) => code.active).map((code) => [code.id, `${code.code}: ${code.name}`]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Items" description="The catalog of stock-keeping units your organization tracks." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New item</Button>} title="New item" action={upsertItem} contentClassName="sm:max-w-xl">
            <ItemFields categoryItems={categoryItems} taxCodeItems={taxCodeItems} defaultReorderPoint={settings.defaultReorderPoint} />
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

      {items.length === 0 ? (
        <EmptyState icon={Package} title="No items yet" description="Items you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Image</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Cost price</TableHead>
              <TableHead>On hand</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const totalQuantity = item.stock.reduce((sum, s) => sum + s.quantity, 0);
              const lowStock = item.trackInventory && totalQuantity <= item.reorderPoint;
              return (
                <TableRow key={item.id}>
                  <TableCell>{item.imageData ? <Image src={`/api/inventory/items/${item.id}/image`} alt="" width={44} height={44} unoptimized className="size-11 rounded-md border object-cover" /> : <div className="flex size-11 items-center justify-center rounded-md border bg-muted text-muted-foreground"><ImageIcon className="size-5" aria-hidden="true" /></div>}</TableCell>
                  <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.category?.name ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{Number(item.costPrice).toFixed(2)}</TableCell>
                  <TableCell>
                    {item.trackInventory ? (
                      <Badge variant={lowStock ? "destructive" : "outline"}>
                        {totalQuantity} {item.unit}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not tracked</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <EntityDialog
                        trigger={<Button size="sm" variant="ghost">Edit</Button>}
                        title="Edit item"
                        action={upsertItem}
                        submitLabel="Save changes"
                        contentClassName="sm:max-w-xl"
                      >
                        <input type="hidden" name="id" value={item.id} />
                        <ItemFields
                          item={{ ...item, costPrice: item.costPrice.toString(), salesPrice: item.salesPrice.toString(), onHand: totalQuantity }}
                          categoryItems={categoryItems}
                          taxCodeItems={taxCodeItems}
                        />
                      </EntityDialog>
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
