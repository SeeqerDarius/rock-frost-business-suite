import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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
