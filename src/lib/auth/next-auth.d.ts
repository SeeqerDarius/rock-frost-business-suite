import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
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
      name?: string | null;
      email?: string | null;
      organizationId?: string;
      role?: string;
    };
  }
}
