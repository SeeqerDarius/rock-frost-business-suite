import "server-only";

import type { ModuleRequestPriority, ModuleRequestStatus, ModuleRequestType } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { ensureRevenueAccountsForOrg } from "@/lib/accounting-integration";
import { assertTrialProductLimit } from "@/platform/trials/service";
import { productGroupKeys } from "@/platform/modules/product-groups";

export interface CreateModuleRequestInput {
  organizationId: string;
  moduleId?: string | null;
  requestedById: string;
  contactSubmissionId?: string | null;
  type: ModuleRequestType;
  priority?: ModuleRequestPriority;
  title: string;
  businessJustification: string;
  customizationDetails?: string | null;
  expectedUsers?: number | null;
}

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export async function createModuleRequest(input: CreateModuleRequestInput) {
  if (input.moduleId) {
    const module_ = await db.module.findUnique({ where: { id: input.moduleId } });
    if (!module_) throw new Error("The selected module does not exist.");
  }

  return db.$transaction((tx) => createModuleRequestInTransaction(tx, input));
}

const MAX_TITLE_LENGTH = 200;

/** Builds a per-module title so each request in a multi-module submission stays identifiable in both queues. */
export function moduleScopedTitle(title: string, moduleName: string) {
  const suffix = ` (${moduleName})`;
  if (title.length + suffix.length <= MAX_TITLE_LENGTH) return `${title}${suffix}`;
  return `${title.slice(0, Math.max(0, MAX_TITLE_LENGTH - suffix.length - 3)).trimEnd()}...${suffix}`;
}

/**
 * Creates one request per selected module in a single transaction, so an
 * organization can ask for several modules at once while operators still
 * review, quote, and approve-and-enable each module independently. With no
 * modules selected (custom module, integration, migration) it creates one
 * request without a module, matching `createModuleRequest`.
 */
export async function createModuleRequestsForModules({
  moduleIds: requestedModuleIds,
  ...base
}: Omit<CreateModuleRequestInput, "moduleId"> & { moduleIds: string[] }) {
  const moduleIds = [...new Set(requestedModuleIds)];
  if (moduleIds.length === 0) {
    return [await createModuleRequest({ ...base, moduleId: null })];
  }

  const modules = await db.module.findMany({ where: { id: { in: moduleIds } }, select: { id: true, name: true } });
  if (modules.length !== moduleIds.length) throw new Error("A selected module does not exist.");
  const nameById = new Map(modules.map((module_) => [module_.id, module_.name]));

  return db.$transaction(async (tx) => {
    const requests = [];
    for (const moduleId of moduleIds) {
      requests.push(
        await createModuleRequestInTransaction(tx, {
          ...base,
          moduleId,
          title: moduleIds.length > 1 ? moduleScopedTitle(base.title, nameById.get(moduleId) ?? "") : base.title,
        }),
      );
    }
    return requests;
  });
}

async function createModuleRequestInTransaction(tx: TransactionClient, input: CreateModuleRequestInput) {
  const request = await tx.moduleRequest.create({
    data: {
      organizationId: input.organizationId,
      moduleId: input.moduleId ?? null,
      requestedById: input.requestedById,
      contactSubmissionId: input.contactSubmissionId ?? null,
      type: input.type,
      priority: input.priority ?? "NORMAL",
      title: input.title,
      businessJustification: input.businessJustification,
      customizationDetails: input.customizationDetails ?? null,
      expectedUsers: input.expectedUsers ?? null,
      events: {
        create: {
          authorId: input.requestedById,
          toStatus: "SUBMITTED",
          note: "Request submitted.",
        },
      },
    },
  });

  if (input.contactSubmissionId) {
    await tx.contactSubmission.update({
      where: { id: input.contactSubmissionId },
      data: { status: "LINKED", organizationId: input.organizationId },
    });
  }

  await logAuditEvent(
    {
      organizationId: input.organizationId,
      userId: input.requestedById,
      module: "platform",
      action: "module_request.created",
      entityName: "ModuleRequest",
      entityId: request.id,
      metadata: { type: input.type, moduleId: input.moduleId ?? null, title: input.title },
    },
    tx,
  );

  return request;
}

export interface UpdateModuleRequestInput {
  requestId: string;
  actorId: string;
  assignedToId?: string | null;
  status: ModuleRequestStatus;
  priority: ModuleRequestPriority;
  note?: string | null;
  isInternal?: boolean;
  decisionReason?: string | null;
  externalReference?: string | null;
  enableModule?: boolean;
}

export async function updateModuleRequest(input: UpdateModuleRequestInput) {
  return db.$transaction(async (tx) => {
    const current = await tx.moduleRequest.findUnique({
      where: { id: input.requestId },
      include: { module: true },
    });
    if (!current) throw new Error("Request not found.");

    if (input.assignedToId) {
      const assignee = await tx.user.findFirst({
        where: {
          id: input.assignedToId,
          organizationMemberships: {
            some: {
              status: "ACTIVE",
              role: { name: "Super Admin", isSystem: true, organizationId: null },
            },
          },
        },
      });
      if (!assignee) throw new Error("The selected assignee is not a platform operator.");
    }

    if (input.enableModule) {
      if (!current.moduleId || current.type !== "ENABLE_EXISTING") {
        throw new Error("Only an existing-module request can enable a module.");
      }
      const groupedModules = await tx.module.findMany({ where: { code: { in: [...productGroupKeys(current.module?.code ?? "")] } }, select: { id: true, code: true } });
      await assertTrialProductLimit(tx, current.organizationId, groupedModules.map((entry) => entry.code));
      for (const module_ of groupedModules) await tx.organizationModule.upsert({
        where: { organizationId_moduleId: { organizationId: current.organizationId, moduleId: module_.id } },
        update: { enabled: true, enabledAt: new Date() },
        create: { organizationId: current.organizationId, moduleId: module_.id, enabled: true, enabledAt: new Date() },
      });
      await ensureRevenueAccountsForOrg(tx, current.organizationId);
    }

    const completedAt = input.status === "COMPLETED" ? new Date() : null;
    const approvedAt =
      input.status === "APPROVED" || input.enableModule ? current.approvedAt ?? new Date() : current.approvedAt;

    const request = await tx.moduleRequest.update({
      where: { id: current.id },
      data: {
        assignedToId: input.assignedToId ?? null,
        status: input.status,
        priority: input.priority,
        decisionReason: input.decisionReason || null,
        externalReference: input.externalReference || null,
        approvedAt,
        completedAt,
        events: {
          create: {
            authorId: input.actorId,
            fromStatus: current.status,
            toStatus: input.status,
            note: input.note || null,
            isInternal: input.isInternal ?? false,
          },
        },
      },
    });

    const statusChanged = current.status !== input.status;
    if (statusChanged || (input.note && !input.isInternal)) {
      await tx.notification.create({
        data: {
          organizationId: current.organizationId,
          userId: current.requestedById,
          type: "MODULE_REQUEST_UPDATE",
          title: `Module request: ${input.status.replaceAll("_", " ").toLowerCase()}`,
          message: input.note || `Your request "${current.title}" has been updated.`,
          status: "QUEUED",
          metadata: { requestId: current.id, status: input.status },
        },
      });
    }

    await logAuditEvent(
      {
        organizationId: current.organizationId,
        userId: input.actorId,
        module: "platform",
        action: input.enableModule ? "module_request.approved_and_enabled" : "module_request.updated",
        entityName: "ModuleRequest",
        entityId: current.id,
        metadata: {
          fromStatus: current.status,
          toStatus: input.status,
          assignedToId: input.assignedToId ?? null,
          module: current.module?.code ?? null,
        },
      },
      tx,
    );

    return request;
  });
}

export async function addRequesterMessage(input: {
  requestId: string;
  organizationId: string;
  authorId: string;
  note: string;
}) {
  const request = await db.moduleRequest.findFirst({
    where: { id: input.requestId, organizationId: input.organizationId },
  });
  if (!request) throw new Error("Request not found.");

  await db.moduleRequestEvent.create({
    data: {
      moduleRequestId: request.id,
      authorId: input.authorId,
      note: input.note,
      isInternal: false,
    },
  });

  await logAuditEvent({
    organizationId: input.organizationId,
    userId: input.authorId,
    module: "platform",
    action: "module_request.message_added",
    entityName: "ModuleRequest",
    entityId: request.id,
  });
}
