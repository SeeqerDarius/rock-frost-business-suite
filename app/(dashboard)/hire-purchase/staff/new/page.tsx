import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { createStaff } from "@/lib/hire-purchase/actions/staff";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

export default async function NewStaffPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const { error } = await searchParams;

  const [members, linkedStaff] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: tenant.organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    db.hirePurchaseStaff.findMany({ where: { organizationId: tenant.organizationId, userId: { not: null } }, select: { userId: true } }),
  ]);
  const linkedUserIds = new Set(linkedStaff.map((s) => s.userId));
  const availableMembers = members.filter((m) => !linkedUserIds.has(m.user.id));

  return (
    <DashboardShell title="New staff" subtitle="Register a Hire Purchase staff profile and optionally link it to an existing login.">
      <div className="glass-card mx-auto max-w-2xl rounded-3xl border border-white/10 p-8">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{decodeURIComponent(error)}</div>
        ) : null}
        <form action={createStaff} className="space-y-5">
          <label className={label}>
            <span className="mb-2 inline-block">Full name</span>
            <input name="fullName" required className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Email</span>
            <input name="email" type="email" required className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Phone</span>
            <input name="phone" className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Linked login (optional)</span>
            <select name="userId" className={field}>
              <option value="">No login access yet</option>
              {availableMembers.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name ?? m.user.email} ({m.user.email})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Invite the person to the organization first, then link their login here so they can sign in as this staff member.
            </p>
          </label>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Create staff profile
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
