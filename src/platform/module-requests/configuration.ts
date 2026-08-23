import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

const configKey = z.string().trim().min(1).max(80).regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/);
const configText = z.string().trim().max(160);

export const organizationModuleConfigurationSchema = z.object({
  version: z.number().int().positive().default(1),
  features: z.record(configKey, z.boolean()).default({}),
  limits: z.record(configKey, z.number().finite().nonnegative()).default({}),
  workflow: z.record(configKey, configText).default({}),
  terminology: z.record(configKey, configText).default({}),
  extensions: z.array(configKey).max(50).default([]),
});

export type OrganizationModuleConfiguration = z.infer<typeof organizationModuleConfigurationSchema>;

export const EMPTY_MODULE_CONFIGURATION: OrganizationModuleConfiguration = {
  version: 1,
  features: {},
  limits: {},
  workflow: {},
  terminology: {},
  extensions: [],
};

export function parseOrganizationModuleConfiguration(
  value: Prisma.JsonValue | null | undefined,
): OrganizationModuleConfiguration {
  const parsed = organizationModuleConfigurationSchema.safeParse(value ?? EMPTY_MODULE_CONFIGURATION);
  return parsed.success ? parsed.data : EMPTY_MODULE_CONFIGURATION;
}

export function parseConfigurationJson(value: string) {
  try {
    const json = JSON.parse(value) as unknown;
    return organizationModuleConfigurationSchema.safeParse(json);
  } catch {
    return {
      success: false as const,
      error: new z.ZodError([
        { code: "custom", path: [], message: "Configuration must be valid JSON." },
      ]),
    };
  }
}

export async function getOrganizationModuleConfiguration(
  organizationId: string,
  moduleCode: string,
): Promise<OrganizationModuleConfiguration> {
  const assignment = await db.organizationModule.findFirst({
    where: { organizationId, module: { code: moduleCode } },
    select: { configuration: true },
  });
  return parseOrganizationModuleConfiguration(assignment?.configuration);
}

/**
 * Schema-free settings storage for modules that have no dedicated
 * `<Module>Settings` Prisma model (Fleet, Projects, Accounting, CRM, HR,
 * Inventory, POS, Procurement all use this today — see each module's
 * `settings/actions.ts`). Reuses the same `OrganizationModule.configuration`
 * JSON column the platform operator's raw-JSON configuration editor
 * (`/app/platform/organizations/[organizationId]/modules/[moduleId]`)
 * already writes to, so a tenant-facing settings save and a platform
 * override both land in the same validated shape rather than two
 * competing stores.
 *
 * This does a targeted **shallow merge** into `features`/`limits`/
 * `workflow`/`terminology` rather than replacing the whole configuration
 * object, so a tenant saving their module's settings can never silently
 * wipe out an unrelated key a platform operator set via the raw editor
 * (or vice versa).
 */
export async function updateOrganizationModuleConfigurationValues(
  organizationId: string,
  moduleCode: string,
  patch: {
    features?: Record<string, boolean>;
    limits?: Record<string, number>;
    workflow?: Record<string, string>;
    terminology?: Record<string, string>;
  },
  actorId?: string | null,
): Promise<OrganizationModuleConfiguration> {
  const module_ = await db.module.findUnique({ where: { code: moduleCode }, select: { id: true } });
  if (!module_) throw new Error(`Unknown module code "${moduleCode}".`);

  const current = await getOrganizationModuleConfiguration(organizationId, moduleCode);
  const merged = organizationModuleConfigurationSchema.parse({
    version: current.version,
    features: { ...current.features, ...patch.features },
    limits: { ...current.limits, ...patch.limits },
    workflow: { ...current.workflow, ...patch.workflow },
    terminology: { ...current.terminology, ...patch.terminology },
    extensions: current.extensions,
  });

  await db.organizationModule.upsert({
    where: { organizationId_moduleId: { organizationId, moduleId: module_.id } },
    update: { configuration: merged as unknown as Prisma.InputJsonValue },
    create: { organizationId, moduleId: module_.id, enabled: false, configuration: merged as unknown as Prisma.InputJsonValue },
  });

  await logAuditEvent({
    organizationId,
    userId: actorId ?? null,
    module: moduleCode,
    action: "module_settings.updated",
    entityName: "OrganizationModule",
    entityId: module_.id,
    metadata: { keys: { ...patch.features, ...patch.limits, ...patch.workflow, ...patch.terminology } },
  });

  return merged;
}
