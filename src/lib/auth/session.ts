import "server-only";

import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./nextauth";

export type AuthSession = Session;

export async function getServerAuthSession(): Promise<AuthSession | null> {
  const session = await getServerSession(authOptions);
  return session ? (session as AuthSession) : null;
}
