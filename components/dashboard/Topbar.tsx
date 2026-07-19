import { getDashboardSessionInfo } from "@/lib/auth/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ProfileMenu } from "./ProfileMenu";

export default async function Topbar() {
  const session = await getDashboardSessionInfo();
  const tenant = await getCurrentTenant();
  const organization = tenant?.organization.name ?? "Organization workspace";
  const branch = tenant?.branch?.name;
  const role = session?.role ?? "Member";
  const name = session?.name ?? session?.email ?? "Guest user";
  const email = session?.email ?? null;

  return (
    <div className="flex flex-col gap-4 border-b border-white/10 bg-[#03060f]/90 px-4 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{organization}</h1>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-full items-center rounded-3xl border border-white/10 bg-[#02050d] px-4 py-3 text-sm text-slate-300 shadow-sm shadow-blue-500/5 sm:max-w-xs">
          <span className="mr-3 text-cyan-300">🔎</span>
          <input
            type="search"
            placeholder="Search across your workspace"
            className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Tenant</p>
          <p className="font-semibold text-slate-100">{organization}</p>
          <p className="text-xs text-slate-400">
            {branch ? `${branch} · ` : ""}Role: {role}
          </p>
        </div>
        <ProfileMenu name={name} email={email} role={role} organization={organization} />
      </div>
    </div>
  );
}
