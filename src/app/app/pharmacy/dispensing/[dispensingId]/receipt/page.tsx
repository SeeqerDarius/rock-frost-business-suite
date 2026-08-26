import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getDispensingReceipt, getPharmacySettings } from "@/modules/pharmacy/service";
import { PAYMENT_METHOD_ITEMS } from "../../../payment-methods";
import { PrintReceiptButton } from "./print-button";

export default async function DispensingReceiptPage({
  params,
}: {
  params: Promise<{ dispensingId: string }>;
}) {
  const { dispensingId } = await params;
  const tenant = await requireModuleAccess("pharmacy");
  const [dispensing, settings] = await Promise.all([
    getDispensingReceipt(tenant.organizationId, dispensingId),
    getPharmacySettings(tenant.organizationId),
  ]);
  if (!dispensing) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6 print:max-w-none">
      <div className="flex justify-end print:hidden">
        <PrintReceiptButton />
      </div>

      <div className="space-y-6 rounded-lg border bg-background p-8 print:rounded-none print:border-none print:p-0">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">{tenant.organization.name}</h1>
          <p className="text-xs text-muted-foreground">
            {[settings.licenceNumber ? `Licence ${settings.licenceNumber}` : null, settings.superintendentPharmacist ? `Superintendent: ${settings.superintendentPharmacist}` : null]
              .filter(Boolean)
              .join(" · ") || "Pharmacy dispensing receipt"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 border-y py-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Receipt number</p>
            <p className="font-medium">{dispensing.dispensingNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="font-medium">{dispensing.dispensedAt.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Patient</p>
            <p className="font-medium">{dispensing.patient?.fullName ?? "Walk-in"}</p>
          </div>
          {dispensing.paymentMethod ? (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Payment method</p>
              <p className="font-medium">{PAYMENT_METHOD_ITEMS[dispensing.paymentMethod] ?? dispensing.paymentMethod}</p>
            </div>
          ) : null}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Medicine</th>
              <th className="pb-2 font-medium">Batch</th>
              <th className="pb-2 text-right font-medium">Qty</th>
              <th className="pb-2 text-right font-medium">Unit price</th>
              <th className="pb-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {dispensing.lines.map((line) => (
              <tr key={line.id} className="border-b last:border-0">
                <td className="py-2">{line.medicine.name}</td>
                <td className="py-2 text-muted-foreground">{line.batch.batchNumber}</td>
                <td className="py-2 text-right">{line.quantity}</td>
                <td className="py-2 text-right">{line.unitPrice.toFixed(2)}</td>
                <td className="py-2 text-right">{line.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-full max-w-48 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{dispensing.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>{dispensing.discount.toFixed(2)}</span></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{dispensing.total.toFixed(2)}</span></div>
        </div>

        <p className="text-center text-xs text-muted-foreground">This receipt is a record of dispensing and does not certify regulatory compliance.</p>
      </div>
    </div>
  );
}
