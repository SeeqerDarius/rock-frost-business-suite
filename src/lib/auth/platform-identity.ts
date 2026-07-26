import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const PLATFORM_ROLE_NAME = "Super Admin";

export const PLATFORM_MEMBERSHIP_ROLE_WHERE = {
  name: PLATFORM_ROLE_NAME,
  isSystem: true,
  organizationId: null,
} as const;

export function hasPlatformRole(role: {
  name: string;
  isSystem: boolean;
  organizationId: string | null;
} | null | undefined): boolean {
  return role?.name === PLATFORM_ROLE_NAME && role.isSystem && role.organizationId === null;
}

export async function findPlatformMembership(userId: string, client: DbClient = db) {
  return client.organizationMember.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      organization: { status: { in: ["ACTIVE", "TRIAL"] } },
      role: PLATFORM_MEMBERSHIP_ROLE_WHERE,
    },
    include: {
      organization: true,
      branch: true,
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });
}

export async function isPlatformUser(userId: string, client: DbClient = db): Promise<boolean> {
  return Boolean(await client.organizationMember.findFirst({
    where: { userId, status: "ACTIVE", role: PLATFORM_MEMBERSHIP_ROLE_WHERE },
    select: { id: true },
  }));
}
