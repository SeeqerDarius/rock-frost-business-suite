import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { getCurrentTenant } from "@/lib/tenant";
import { OrganizationThemeSync } from "@/components/theme/organization-theme-sync";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { buildSurfaceUrl, classifyAppSurface, isIdentityAllowedOnSurface } from "@/lib/app-surfaces";
import { isPlatformOperator } from "@/lib/auth/permissions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

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

  const requestHeaders = await headers();
  const requestSurface = classifyAppSurface(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  const platformIdentity = isPlatformOperator(tenant);
  if (!isIdentityAllowedOnSurface(platformIdentity, requestSurface)) {
    const destination = platformIdentity ? "platform" : "tenant";
    const callbackPath = platformIdentity ? "/app/platform/dashboard" : "/app/dashboard";
    const loginUrl = buildSurfaceUrl(destination, "/login");
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    loginUrl.searchParams.set("reason", "wrong-surface");
    redirect(loginUrl.toString());
  }

  const organization = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { metadata: true, status: true, createdAt: true },
  });
  const metadata = organization?.metadata;
  const workspaceSettings = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).workspaceSettings
    : undefined;
  const theme = workspaceSettings && typeof workspaceSettings === "object"
    ? (workspaceSettings as { theme?: "system" | "light" | "dark" }).theme
    : undefined;

  const trialEndsAt = new Date(organization?.createdAt ?? new Date());
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + 14);
  const trialDaysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000));

  return (
    <>
      <OrganizationThemeSync theme={theme} />
      {!platformIdentity ? (
        <div className="fixed right-24 top-4 z-40 hidden rounded-full border bg-background/95 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur sm:block">
          {organization?.status === "TRIAL"
            ? `Trial workspace · ${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} remaining`
            : organization?.status === "ACTIVE"
              ? "Subscribed workspace"
              : "Subscription inactive"}
        </div>
      ) : null}
      {children}
    </>
  );
}
