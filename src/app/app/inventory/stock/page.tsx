import { Layers } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireCurrentTenant } from "@/lib/tenant";
import { getStockGrid } from "@/modules/inventory/service";

export default async function InventoryStockPage() {
  const tenant = await requireCurrentTenant();
  const stock = await getStockGrid(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="Stock" description="Quantity on hand for every item, by warehouse." />

      {stock.length === 0 ? (
        <EmptyState icon={Layers} title="No stock recorded yet" description="Record a receipt on the Movements page to add stock." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stock.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.item.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{row.item.sku}</TableCell>
                <TableCell className="text-muted-foreground">{row.warehouse.name}</TableCell>
                <TableCell>
                  {row.quantity} {row.item.unit}
                </TableCell>
                <TableCell>
                  <Badge variant={row.quantity === 0 ? "destructive" : "outline"}>{row.quantity === 0 ? "Empty" : "In stock"}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
