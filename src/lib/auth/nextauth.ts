import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

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

        const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValidPassword) {
          return null;
        }

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        const primaryMembership = user.organizationMemberships[0];

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
        token.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          organizationId: user.organizationId,
          role: user.role,
        };
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
  secret: process.env.NEXTAUTH_SECRET,
};
