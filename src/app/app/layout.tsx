import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { getCurrentTenant } from "@/lib/tenant";

/**
 * Real route protection for everything under /app/* — organization scope,
 * every module, and the platform scope all nest under this layout. A signed-in
 * user with no OrganizationMember row sees a "no organization access" message
 * instead of the dashboard, rather than a confusing empty/broken page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();

  if (!session || !session.user?.id) {
    redirect("/login");
  }

  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-semibold">No organization access</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t assigned to an organization yet. Contact an administrator to be added to a
            workspace.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
