import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function FleetSettingsPage() {
  await requirePermission(PERMISSIONS.ORG_SETTINGS_MANAGE);

  return (
    <DashboardShell
      title="Fleet settings"
      subtitle="Configure fleet module preferences, workspace defaults, and integration placeholders."
    >
      <div className="glass-card rounded-3xl border border-white/10 p-8 shadow-sm shadow-blue-500/10">
        <p className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">Settings placeholder</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">Fleet module configuration</h2>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          This page is reserved for future fleet module settings, tenant options, and role-based permission setup.
        </p>
      </div>
    </DashboardShell>
  );
}
