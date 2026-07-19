import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

interface LogAuditEventArgs {
  organizationId: string;
  branchId?: string | null;
  userId?: string | null;
  action: string;
  entityName: string;
  entityId?: string | null;
  changes?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Appends a single audit log entry. Audit logs are append-only — there is no update/delete path. */
export async function logAuditEvent(args: LogAuditEventArgs) {
  return db.auditLog.create({
    data: {
      organizationId: args.organizationId,
      branchId: args.branchId ?? undefined,
      userId: args.userId ?? undefined,
      action: args.action,
      entityName: args.entityName,
      entityId: args.entityId ?? undefined,
      changes: args.changes ?? undefined,
      ipAddress: args.ipAddress ?? undefined,
      userAgent: args.userAgent ?? undefined,
    },
  });
}

export async function getAuditLog(organizationId: string, take = 50) {
  return db.auditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
