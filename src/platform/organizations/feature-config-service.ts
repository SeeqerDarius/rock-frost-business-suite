import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import {
  CONFIGURABLE_FEATURES,
  configurableFeature,
  featureChangeBlocker,
  type ConfigurableFeatureKey,
  type OptionalFeatureKey,
} from "@/platform/modules/feature-catalogue";

/**
 * Reads and writes the per-organization feature configuration described in
 * src/platform/modules/feature-catalogue.ts. Add-ons keep living in their
 * Organization grant columns (so every existing enforcement point is
 * unchanged); optional included capabilities live in
 * OrganizationFeatureSetting. Callers must already have verified the actor
 * is a platform operator: this layer enforces organization scoping,
 * dependencies, stale-change protection, and the audit record.
 */

type Tx = Prisma.TransactionClient;

export class FeatureChangeError extends Error {
  constructor(message: string, readonly code: "unknown-feature" | "not-found" | "stale" | "dependency" | "protected") {
    super(message);
    this.name = "FeatureChangeError";
  }
}

const GRANT_SELECT = {
  id: true,
  name: true,
  offlineAccessGranted: true,
  smsNotificationsGranted: true,
  schoolPortalGranted: true,
  schoolGuardianMessagingGranted: true,
  schoolAssignmentsGranted: true,
} as const;

type GrantRow = { [K in keyof typeof GRANT_SELECT]: K extends "id" | "name" ? string : boolean };

function effectiveValues(organization: GrantRow, settings: { featureKey: string; enabled: boolean }[]): Record<ConfigurableFeatureKey, boolean> {
  const byKey = new Map(settings.map((setting) => [setting.featureKey, setting.enabled]));
  return Object.fromEntries(CONFIGURABLE_FEATURES.map((feature) => {
    if (feature.storage.kind === "organizationGrant") return [feature.key, Boolean(organization[feature.storage.grantField as keyof GrantRow])];
    return [feature.key, byKey.get(feature.key) ?? feature.defaultEnabled];
  })) as Record<ConfigurableFeatureKey, boolean>;
}

/** Every configurable feature's effective value for one organization. */
export async function getOrganizationFeatureValues(organizationId: string, client: Tx | typeof db = db) {
  const [organization, settings] = await Promise.all([
    client.organization.findUnique({ where: { id: organizationId }, select: GRANT_SELECT }),
    client.organizationFeatureSetting.findMany({ where: { organizationId }, select: { featureKey: true, enabled: true, updatedAt: true, updatedById: true } }),
  ]);
  if (!organization) return null;
  return { name: organization.name, values: effectiveValues(organization as GrantRow, settings), settings };
}

/**
 * Whether an optional included capability is on for an organization. The
 * School transport and library services call this before every read and
 * write, so switching a feature off is enforced on the server, not only in
 * navigation. Absent row means the catalogue default.
 */
export async function isOrganizationFeatureEnabled(organizationId: string, key: OptionalFeatureKey): Promise<boolean> {
  const feature = configurableFeature(key);
  if (!feature) return false;
  const setting = await db.organizationFeatureSetting.findUnique({ where: { organizationId_featureKey: { organizationId, featureKey: key } }, select: { enabled: true } });
  return setting?.enabled ?? feature.defaultEnabled;
}

/**
 * Applies one feature change for one organization, atomically. `expected` is
 * the value the operator saw; if someone else changed it since, nothing is
 * written and the caller is told to reload. Dependencies are re-checked
 * inside the transaction under an organization-scoped advisory lock, so two
 * operators cannot race an invalid combination into place.
 */
export async function setOrganizationFeature(input: {
  actorUserId: string;
  organizationId: string;
  featureKey: string;
  enabled: boolean;
  expected: boolean;
  moduleKey: string;
}) {
  const feature = configurableFeature(input.featureKey);
  if (!feature || !feature.moduleKeys.includes(input.moduleKey)) throw new FeatureChangeError("That feature is not part of this module.", "unknown-feature");

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`organization-features:${input.organizationId}`}))`;
    const current = await getOrganizationFeatureValues(input.organizationId, tx);
    if (!current) throw new FeatureChangeError("The organization was not found.", "not-found");
    const previous = current.values[feature.key];
    if (previous !== input.expected) {
      throw new FeatureChangeError(`${feature.name} was changed by someone else since this page loaded. It is now ${previous ? "on" : "off"}. Reload and try again.`, "stale");
    }
    if (previous === input.enabled) return { changed: false, previous, next: previous };
    const blocker = featureChangeBlocker(feature.key, input.enabled, current.values);
    if (blocker) throw new FeatureChangeError(blocker, "dependency");

    if (feature.storage.kind === "organizationGrant") {
      await tx.organization.update({
        where: { id: input.organizationId },
        data: {
          [feature.storage.grantField]: input.enabled,
          [feature.storage.grantedAtField]: input.enabled ? new Date() : null,
          [feature.storage.grantField.replace(/Granted$/, "GrantedById")]: input.enabled ? input.actorUserId : null,
        },
      });
    } else {
      await tx.organizationFeatureSetting.upsert({
        where: { organizationId_featureKey: { organizationId: input.organizationId, featureKey: feature.key } },
        update: { enabled: input.enabled, updatedById: input.actorUserId },
        create: { organizationId: input.organizationId, moduleKey: feature.moduleKeys[0], featureKey: feature.key, enabled: input.enabled, updatedById: input.actorUserId },
      });
    }

    await logAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "platform",
      action: "organization_feature.updated",
      entityName: feature.storage.kind === "organizationGrant" ? "Organization" : "OrganizationFeatureSetting",
      entityId: input.organizationId,
      metadata: {
        organization: current.name,
        module: input.moduleKey,
        feature: feature.key,
        featureKind: feature.kind,
        oldValue: previous,
        newValue: input.enabled,
      },
    }, tx);
    return { changed: true, previous, next: input.enabled };
  });
}
