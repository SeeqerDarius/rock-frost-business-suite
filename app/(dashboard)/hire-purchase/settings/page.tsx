import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getHirePurchaseSettings } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { updateHirePurchaseSettings } from "@/lib/hire-purchase/actions/settings";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

export default async function HirePurchaseSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_SETTINGS_MANAGE);
  const { error, updated } = await searchParams;
  const settings = await getHirePurchaseSettings(tenant.organizationId);

  return (
    <DashboardShell title="Hire Purchase settings" subtitle="Operational defaults: installment scheduling, thresholds, fees, and ID formats.">
      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Please correct: {decodeURIComponent(error)}
        </div>
      ) : null}
      {updated ? <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">Settings saved.</div> : null}

      <div className="glass-card mx-auto max-w-3xl rounded-3xl border border-white/10 p-8">
        <form action={updateHirePurchaseSettings} className="grid gap-5 sm:grid-cols-2">
          <label className={label}>
            <span className="mb-2 inline-block">Default installment duration (days)</span>
            <input name="installmentDurationDays" type="number" min="1" defaultValue={settings.installmentDurationDays} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Default daily collection</span>
            <input name="defaultDailyCollection" type="number" min="0" step="0.01" defaultValue={String(settings.defaultDailyCollection)} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Administration fee (%)</span>
            <input name="administrationFeePercent" type="number" min="0" max="100" step="0.01" defaultValue={String(settings.administrationFeePercent)} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Refund/service fee deduction (%)</span>
            <input name="refundDeductionPercent" type="number" min="0" max="100" step="0.01" defaultValue={String(settings.refundDeductionPercent)} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Archive after delivery (days)</span>
            <input name="deliveryTimeAfterCompletionDays" type="number" min="0" defaultValue={settings.deliveryTimeAfterCompletionDays} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Procurement threshold (%)</span>
            <input name="procurementThresholdPercent" type="number" min="0" max="100" step="0.01" defaultValue={String(settings.procurementThresholdPercent)} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Payment edit window (hours)</span>
            <input name="paymentEditWindowHours" type="number" min="3" max="16" defaultValue={settings.paymentEditWindowHours} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Minimum deposit</span>
            <input name="minimumDeposit" type="number" min="0" step="0.01" defaultValue={String(settings.minimumDeposit)} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Default monthly salary</span>
            <input name="defaultMonthlySalary" type="number" min="0" step="0.01" defaultValue={String(settings.defaultMonthlySalary)} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Default staff inventory quantity</span>
            <input name="defaultStaffInventoryQuantity" type="number" min="0" defaultValue={settings.defaultStaffInventoryQuantity} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Payroll day of month</span>
            <input name="payrollDay" type="number" min="1" max="31" defaultValue={settings.payrollDay} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Commission (%)</span>
            <input name="commissionPercentage" type="number" min="0" max="100" step="0.01" defaultValue={String(settings.commissionPercentage)} className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Receipt prefix</span>
            <input name="receiptPrefix" defaultValue={settings.receiptPrefix} required className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Customer ID prefix</span>
            <input name="customerIdPrefix" defaultValue={settings.customerIdPrefix} required className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Staff code length</span>
            <input name="staffCodeLength" type="number" min="2" max="8" defaultValue={settings.staffCodeLength} className={field} />
          </label>
          <label className="flex items-center gap-3 self-end pb-3 text-sm text-slate-300">
            <input name="commissionEnabled" type="checkbox" defaultChecked={settings.commissionEnabled} className="h-4 w-4 rounded border-white/20 bg-white/5" />
            Commission enabled
          </label>

          <div className="sm:col-span-2">
            <button type="submit" className="w-full rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Save settings
            </button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}
