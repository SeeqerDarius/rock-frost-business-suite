import "server-only";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * The shared, append-only audit trail. Nothing in this codebase ever
 * updates or deletes an AuditLog row through application logic — it's
 * only ever created. See docs/HARDENING_PLAN.md's Pass 4 audit-logging
 * section for the full design and exactly which events are covered.
 *
 * NEVER pass through this: passwords, password hashes, session tokens,
 * raw invitation tokens, full payment credentials, or a full request
 * body. `metadata` should be a small, safe, human-readable summary (ids,
 * names, amounts, statuses) — not a dump of everything the caller had.
 */

type Tx = Prisma.TransactionClient;

export interface AuditEventInput {
  /** Null for events with no resolvable organization (e.g. a failed login for an email matching no user). */
  organizationId: string | null;
  /** The module key this event belongs to (e.g. "accounting", "auth", "administration") — a plain string, not validated against the module registry, since a few audited events (auth, administration) aren't real business modules. */
  module: string;
  action: string;
  entityName: string;
  entityId?: string | null;
  userId?: string | null;
  membershipId?: string | null;
  status?: "SUCCESS" | "FAILURE";
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Writes one audit event. Pass `tx` when the event describes a mutation
 * that just happened inside a database transaction — this makes the
 * audit row commit or roll back atomically with the operation it
 * describes, per the "only persist on commit" requirement. Omit `tx` for
 * events with no enclosing transaction (a login, a rejected request that
 * never wrote anything).
 *
 * Never throws — a failure to write an audit row must never break the
 * real operation it's describing. Failures are logged to the server
 * console instead.
 */
export async function logAuditEvent(input: AuditEventInput, tx?: Tx): Promise<void> {
  const client = tx ?? db;
  try {
    const requestContext = await getRequestContext();
    await client.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        membershipId: input.membershipId ?? null,
        module: input.module,
        action: input.action,
        entityName: input.entityName,
        entityId: input.entityId ?? null,
        status: input.status ?? "SUCCESS",
        correlationId: input.correlationId ?? null,
        changes: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] Failed to write audit log entry:", { action: input.action, entityName: input.entityName, error });
  }
}

/**
 * Best-effort IP/user-agent extraction from the current request's
 * headers — only resolvable inside a real request (a Server Action or
 * Route Handler); returns nulls in any other context (a background
 * sweep, a script) rather than throwing.
 */
async function getRequestContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const headersList = await headers();
    const forwardedFor = headersList.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0]?.trim() ?? null : null;
    const userAgent = headersList.get("user-agent");
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/** A short random id to correlate every audit/log line produced by one request. Not cryptographically significant — just needs to be unique enough to group by. */
export function generateCorrelationId(): string {
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
