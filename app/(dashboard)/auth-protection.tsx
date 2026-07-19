import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { getCurrentTenant } from "@/lib/tenant";

export default async function DashboardAuthProtection({ children }: { children: ReactNode }) {
  const session = await getServerAuthSession();

  if (!session) {
    redirect("/login");
  }

  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020409] px-6 text-center text-slate-100">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-semibold text-white">No organization access</h1>
          <p className="text-sm text-slate-400">
            Your account isn&apos;t assigned to an organization yet. Contact an administrator to be added to a workspace.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
