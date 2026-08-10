import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { hasPlatformRole } from "@/lib/auth/platform-identity";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import {
  classifyAppSurface,
  isIdentityAllowedOnSurface,
  isTrustedAppOrigin,
} from "@/lib/app-surfaces";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorCode: { label: "Two-factor code", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();
        const user = await db.user.findUnique({
          where: { email },
          include: {
            organizationMemberships: {
              include: { role: true, organization: { select: { status: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        });

        const activeMemberships = user?.organizationMemberships.filter(
          (membership) => membership.status === "ACTIVE" && ["ACTIVE", "TRIAL"].includes(membership.organization.status),
        ) ?? [];
        const primaryMembership =
          activeMemberships.find((membership) => hasPlatformRole(membership.role)) ??
          activeMemberships[0] ??
          user?.organizationMemberships[0];

        if (!user || !user.passwordHash || user.status !== "ACTIVE") {
          // No userId/organizationId to attach — this email may not exist
          // at all; the metadata is deliberately just the attempted email,
          // never anything that would confirm or deny account existence
          // to someone reading the failure alone versus a wrong-password
          // failure below.
          await logAuditEvent({
            organizationId: null,
            module: "auth",
            action: "login.failed",
            entityName: "User",
            status: "FAILURE",
            metadata: { email, reason: "no_matching_active_account" },
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await logAuditEvent({
            organizationId: primaryMembership?.organizationId ?? null,
            userId: user.id,
            module: "auth",
            action: "login.failed",
            entityName: "User",
            entityId: user.id,
            status: "FAILURE",
            metadata: { email, reason: "locked_out" },
          });
          return null;
        }

        const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValidPassword) {
          const attempts = user.failedLoginAttempts + 1;
          const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
          await db.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: lockingOut ? 0 : attempts,
              lockedUntil: lockingOut ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
            },
          });
          await logAuditEvent({
            organizationId: primaryMembership?.organizationId ?? null,
            userId: user.id,
            module: "auth",
            action: "login.failed",
            entityName: "User",
            entityId: user.id,
            status: "FAILURE",
            metadata: { email, reason: "wrong_password", lockedOut: lockingOut },
          });
          return null;
        }

        if (user.twoFactorEnabled) {
          let isValidTwoFactorCode = false;
          try {
            isValidTwoFactorCode = !!user.twoFactorSecret && verifyTotpCode(
              decryptTotpSecret(user.twoFactorSecret),
              credentials.twoFactorCode ?? "",
            );
          } catch {
            isValidTwoFactorCode = false;
          }
          if (!isValidTwoFactorCode) {
            const attempts = user.failedLoginAttempts + 1;
            const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
            await db.user.update({
              where: { id: user.id },
              data: {
                failedLoginAttempts: lockingOut ? 0 : attempts,
                lockedUntil: lockingOut ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
              },
            });
            await logAuditEvent({
              organizationId: primaryMembership?.organizationId ?? null,
              userId: user.id,
              module: "auth",
              action: "login.failed",
              entityName: "User",
              entityId: user.id,
              status: "FAILURE",
              metadata: { email, reason: "wrong_two_factor_code", lockedOut: lockingOut },
            });
            return null;
          }
        }

        const requestHost =
          request.headers?.["x-forwarded-host"] ??
          request.headers?.host;
        const requestSurface = classifyAppSurface(
          Array.isArray(requestHost) ? requestHost[0] : requestHost,
        );
        const isPlatformIdentity = hasPlatformRole(primaryMembership?.role);
        if (!isIdentityAllowedOnSurface(isPlatformIdentity, requestSurface)) {
          await logAuditEvent({
            organizationId: primaryMembership?.organizationId ?? null,
            userId: user.id,
            membershipId: primaryMembership?.id ?? null,
            module: "auth",
            action: "login.failed",
            entityName: "User",
            entityId: user.id,
            status: "FAILURE",
            metadata: { email, reason: "wrong_application_surface", requestSurface },
          });
          return null;
        }

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
        });

        await logAuditEvent({
          organizationId: primaryMembership?.organizationId ?? null,
          userId: user.id,
          membershipId: primaryMembership?.id ?? null,
          module: "auth",
          action: "login.success",
          entityName: "User",
          entityId: user.id,
        });

        return {
          id: user.id,
          name: user.name ?? user.email,
          email: user.email,
          organizationId: primaryMembership?.organizationId,
          role: primaryMembership?.role?.name,
          sessionVersion: user.sessionVersion,
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
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        // Deliberately omit `domain`: this makes the cookie host-only, so
        // admin.* and app.* can hold different signed-in accounts.
      },
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/") && !url.startsWith("//")) return new URL(url, baseUrl).toString();
      try {
        const destination = new URL(url);
        return isTrustedAppOrigin(destination.origin) ? destination.toString() : baseUrl;
      } catch {
        return baseUrl;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          organizationId: user.organizationId,
          role: user.role,
          sessionVersion: user.sessionVersion ?? 0,
        };
        return token;
      }

      // Every subsequent request (NextAuth v4 re-runs jwt() on every
      // getServerSession() call, not just at sign-in) re-validates the token
      // against the live database: a since-suspended/deleted user, or a
      // sessionVersion bumped by a password reset / invite acceptance
      // (see src/lib/auth/session-revocation.ts), clears the session here
      // rather than trusting a stale JWT for up to its full 30-day lifetime.
      if (token.user?.id) {
        const current = await db.user.findUnique({
          where: { id: token.user.id },
          select: {
            status: true,
            sessionVersion: true,
            organizationMemberships: {
              where: { status: "ACTIVE", organization: { status: { in: ["ACTIVE", "TRIAL"] } } },
              include: { role: true },
              orderBy: { createdAt: "asc" },
            },
          },
        });

        if (!current || current.status !== "ACTIVE" || current.sessionVersion !== token.user.sessionVersion) {
          token.user = undefined;
        } else {
          const canonicalMembership =
            current.organizationMemberships.find((membership) => hasPlatformRole(membership.role)) ??
            current.organizationMemberships.find((membership) => membership.organizationId === token.user?.organizationId) ??
            current.organizationMemberships[0];
          token.user.organizationId = canonicalMembership?.organizationId;
          token.user.role = canonicalMembership?.role?.name;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.user) {
        session.user = { ...session.user, ...token.user };
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      const userId = token.user?.id;
      if (!userId) return;
      const membership = await db.organizationMember.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
      await logAuditEvent({
        organizationId: membership?.organizationId ?? null,
        userId,
        membershipId: membership?.id ?? null,
        module: "auth",
        action: "logout",
        entityName: "User",
        entityId: userId,
      });
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
