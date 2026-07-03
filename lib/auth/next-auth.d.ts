import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      organizationId?: string;
      role?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    organizationId?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    user?: {
      id: string;
      organizationId?: string;
      role?: string;
    } & DefaultSession["user"];
  }
}
