import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: {
            organizationMemberships: {
              include: { role: true },
              orderBy: { createdAt: "asc" },
            },
          },
        });

        if (!user || !user.passwordHash || user.status !== "ACTIVE") {
          return null;
        }

        const primaryMembership = user.organizationMemberships[0];

        const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValidPassword) {
          if (primaryMembership) {
            await logAuditEvent({
              organizationId: primaryMembership.organizationId,
              userId: user.id,
              action: "login_failed",
              entityName: "User",
              entityId: user.id,
            });
          }
          return null;
        }

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        if (primaryMembership) {
          await logAuditEvent({
            organizationId: primaryMembership.organizationId,
            userId: user.id,
            action: "login_succeeded",
            entityName: "User",
            entityId: user.id,
          });
          await createNotification({
            organizationId: primaryMembership.organizationId,
            userId: user.id,
            type: "auth.login",
            title: "Welcome back",
            message: `You signed in to Rock Frost Business Suite on ${new Date().toISOString().slice(0, 10)}.`,
          });
        }

        return {
          id: user.id,
          name: user.name ?? user.email,
          email: user.email,
          organizationId: primaryMembership?.organizationId,
          role: primaryMembership?.role?.name,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.user = user;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: token.user as Record<string, unknown>,
      };
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? "placeholder-secret",
};
