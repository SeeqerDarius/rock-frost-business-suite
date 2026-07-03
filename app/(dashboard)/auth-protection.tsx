import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";

export default async function DashboardAuthProtection({ children }: { children: ReactNode }) {
  const session = await getServerAuthSession();

  if (!session) {
    redirect("/login");
  }

  return <>{children}</>;
}
