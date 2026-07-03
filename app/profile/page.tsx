import type { Metadata, Route } from "next";
import Link from "next/link";
import { getDashboardSessionInfo } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Profile | Rock Frost Business Suite",
  description: "Manage your profile settings, organization details, and account preferences.",
};

export default async function ProfilePage() {
  const session = await getDashboardSessionInfo();
  const name = session?.name ?? session?.email ?? "Guest user";
  const email = session?.email ?? "Not available";
  const role = session?.role ?? "Member";
  const organization = session?.organizationId ?? "Organization workspace";

  return (
    <div className="min-h-screen bg-[#020409] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-[#02101f]/95 p-8 shadow-2xl shadow-cyan-900/20 backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Profile</p>
              <h1 className="mt-3 text-3xl font-semibold text-white">Account settings</h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-400">
                Review your account, organization, and role information. Use this page as the centralized profile panel for future security and preferences.
              </p>
            </div>
            <Link href={"/dashboard" as Route} className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20">
              Back to dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[2rem] border border-white/10 bg-[#02101f]/95 p-8 shadow-2xl shadow-cyan-900/10">
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Profile summary</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">{name}</h2>
              </div>
              <div className="space-y-4 text-sm text-slate-300">
                <div className="rounded-3xl bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Email</p>
                  <p className="mt-2 text-base font-medium text-white">{email}</p>
                </div>
                <div className="rounded-3xl bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Organization</p>
                  <p className="mt-2 text-base font-medium text-white">{organization}</p>
                </div>
                <div className="rounded-3xl bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Role</p>
                  <p className="mt-2 text-base font-medium text-white">{role}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[#02101f]/95 p-8 shadow-2xl shadow-cyan-900/10">
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">Account actions</p>
              <div className="space-y-4">
                <div className="rounded-3xl bg-white/5 p-5">
                  <p className="font-semibold text-white">Security settings</p>
                  <p className="mt-2 text-sm text-slate-400">Future auth controls, password management, and two-factor options belong here.</p>
                </div>
                <div className="rounded-3xl bg-white/5 p-5">
                  <p className="font-semibold text-white">Organization settings</p>
                  <p className="mt-2 text-sm text-slate-400">Manage tenant profile, domain, and company-level permission defaults.</p>
                </div>
                <div className="rounded-3xl bg-white/5 p-5">
                  <p className="font-semibold text-white">Support</p>
                  <p className="mt-2 text-sm text-slate-400">Access audit logs, support channels, and billing contacts from here.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
