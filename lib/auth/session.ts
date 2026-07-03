import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./nextauth";

export type AuthSession = Session;

export interface DashboardSessionInfo {
  id: string;
  name?: string | null;
  email?: string | null;
  organizationId?: string;
  role?: string;
}

export async function getServerAuthSession(): Promise<AuthSession | null> {
  const session = await getServerSession(authOptions);
  return session ? (session as AuthSession) : null;
}

export async function getDashboardSessionInfo(): Promise<DashboardSessionInfo | null> {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    organizationId: session.user.organizationId,
    role: session.user.role,
  };
}

export function getMockSession(): AuthSession {
  return {
    user: {
      id: "demo-user",
      email: "demo.user@rockfrost.io",
      name: "Demo User",
      organizationId: "demo-organization",
      role: "Administrator",
    },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  };
}
