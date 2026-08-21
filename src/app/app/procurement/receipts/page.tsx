import { ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listGoodsReceipts } from "@/modules/procurement/service";

export default async function ProcurementReceiptsPage() {
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_RECEIPTS_MANAGE)) return <EmptyState icon={ReceiptText} title="No access" description="Your role cannot view goods receipts." />;
  const receipts = await listGoodsReceipts(tenant.organizationId);
  return <div className="space-y-6"><PageHeader title="Goods Receipts" description="Immutable evidence of quantities received against purchase orders." />
    {receipts.length === 0 ? <EmptyState icon={ReceiptText} title="No goods receipts" description="Receiving a purchase order line creates a numbered receipt here." /> : <div className="space-y-3">{receipts.map((receipt) => <section key={receipt.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{receipt.receiptNumber}</p><p className="text-sm text-muted-foreground">{receipt.order.orderNumber}, {receipt.order.vendor.name}</p></div><Badge variant="outline">{receipt.receivedAt.toLocaleString()}</Badge></div><div className="mt-3 space-y-1">{receipt.lines.map((line) => <p key={line.id} className="text-sm">{line.item?.name ?? line.orderLine.description}: {line.quantity}</p>)}</div><p className="mt-2 text-xs text-muted-foreground">Warehouse: {receipt.warehouse?.name ?? "Non-stock receipt"}</p></section>)}</div>}
  </div>;
}
