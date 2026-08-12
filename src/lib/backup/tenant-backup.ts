import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BACKUP_MODULES, type BackupModule } from "@/lib/backup/scopes";

const MODEL_PREFIXES: Record<BackupModule, string[]> = {
  accounting: ["Accounting"],
  analytics: [],
  crm: ["Crm"],
  fleet: ["Fleet"],
  hotel: ["Hotel"],
  hr: ["Hr"],
  installment: ["HirePurchase"],
  inventory: ["Inventory"],
  payroll: ["Payroll"],
  pharmacy: ["Pharmacy"],
  pos: ["Pos"],
  procurement: ["Procurement"],
  projects: ["Project"],
  school: ["School"],
};

type Delegate = {
  findMany(args: { where: { organizationId: string } }): Promise<Record<string, unknown>[]>;
  upsert(args: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<unknown>;
};

type ModelInfo = (typeof Prisma.dmmf.datamodel.models)[number];

export type TenantBackup = {
  kind: "ROCK_FROST_TENANT_BACKUP";
  version: 1;
  generatedAt: string;
  organizationId: string;
  tenantCode: string;
  scope: BackupModule | "all";
  includedModules: BackupModule[];
  models: Record<string, Record<string, unknown>[]>;
};

function delegateName(modelName: string) {
  return `${modelName[0].toLowerCase()}${modelName.slice(1)}`;
}

function delegate(client: unknown, modelName: string) {
  return (client as Record<string, unknown>)[delegateName(modelName)] as Delegate;
}

export function modelsForScope(scope: BackupModule | "all", allowedModules: readonly BackupModule[] = BACKUP_MODULES) {
  const prefixes = scope === "all"
    ? allowedModules.flatMap((module) => MODEL_PREFIXES[module])
    : MODEL_PREFIXES[scope];
  return Prisma.dmmf.datamodel.models.filter((model) =>
    prefixes.some((prefix) => model.name.startsWith(prefix)) &&
    model.fields.some((field) => field.name === "organizationId") &&
    model.fields.some((field) => field.name === "id" && field.isId),
  );
}

function dependencyOrder(models: ModelInfo[]) {
  const names = new Set(models.map((model) => model.name));
  const remaining = new Map(models.map((model) => [model.name, model]));
  const ordered: ModelInfo[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((model) => model.fields
      .filter((field) => field.kind === "object" && field.relationFromFields?.length && field.type !== model.name)
      .every((field) => !names.has(field.type) || ordered.some((entry) => entry.name === field.type)));
    const batch = ready.length ? ready : [[...remaining.values()].sort((a, b) => a.name.localeCompare(b.name))[0]];
    for (const model of batch) {
      ordered.push(model);
      remaining.delete(model.name);
    }
  }
  return ordered;
}

function reviveRow(model: ModelInfo, row: Record<string, unknown>) {
  const revived = { ...row };
  for (const field of model.fields) {
    if (field.kind === "scalar" && field.type === "DateTime" && typeof revived[field.name] === "string") {
      revived[field.name] = new Date(revived[field.name] as string);
    }
  }
  return revived;
}

export function parseBackupScope(value: string | null): BackupModule | "all" | null {
  if (!value || value === "all") return "all";
  return BACKUP_MODULES.includes(value as BackupModule) ? value as BackupModule : null;
}

export function resolveBackupModules(scope: BackupModule | "all", activeModules: readonly BackupModule[]) {
  const uniqueActive = [...new Set(activeModules)];
  if (scope === "all") return uniqueActive.length ? uniqueActive : null;
  return uniqueActive.includes(scope) ? [scope] : null;
}

export async function buildTenantBackup(organizationId: string, tenantCode: string, scope: BackupModule | "all", includedModules: BackupModule[]) {
  const models = await readTenantModuleData(organizationId, scope, includedModules);
  return {
    kind: "ROCK_FROST_TENANT_BACKUP",
    version: 1,
    generatedAt: new Date().toISOString(),
    organizationId,
    tenantCode,
    scope,
    includedModules,
    models,
  } satisfies TenantBackup;
}

export async function readTenantModuleData(organizationId: string, scope: BackupModule | "all", includedModules: BackupModule[]) {
  const models: TenantBackup["models"] = {};
  await Promise.all(modelsForScope(scope, includedModules).map(async (model) => {
    models[model.name] = await delegate(db, model.name).findMany({ where: { organizationId } });
  }));
  return models;
}

export function validateTenantBackup(value: unknown, organizationId: string, tenantCode: string, activeModules: readonly BackupModule[] = BACKUP_MODULES): value is TenantBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const backup = value as Partial<TenantBackup>;
  if (backup.kind !== "ROCK_FROST_TENANT_BACKUP" || backup.version !== 1 || backup.organizationId !== organizationId || backup.tenantCode !== tenantCode) return false;
  if (typeof backup.scope !== "string" || !parseBackupScope(backup.scope) || !backup.models || typeof backup.models !== "object" || Array.isArray(backup.models)) return false;
  const includedModules = Array.isArray(backup.includedModules)
    ? backup.includedModules.filter((module): module is BackupModule => BACKUP_MODULES.includes(module as BackupModule))
    : backup.scope === "all" ? activeModules : [backup.scope];
  const resolvedModules = resolveBackupModules(backup.scope, activeModules);
  if (!resolvedModules || includedModules.length !== new Set(includedModules).size || includedModules.some((module) => !resolvedModules.includes(module))) return false;
  if (backup.scope !== "all" && (includedModules.length !== 1 || includedModules[0] !== backup.scope)) return false;
  const allowedModels = new Set(modelsForScope(backup.scope, includedModules).map((model) => model.name));
  return Object.entries(backup.models).every(([name, rows]) => allowedModels.has(name) && Array.isArray(rows) && rows.every((row) =>
    !!row && typeof row === "object" && !Array.isArray(row) && (row as Record<string, unknown>).organizationId === organizationId && typeof (row as Record<string, unknown>).id === "string",
  ));
}

export async function mergeTenantBackup(backup: TenantBackup) {
  const selected = modelsForScope(backup.scope, backup.includedModules).filter((model) => backup.models[model.name]);
  let restored = 0;
  await db.$transaction(async (transaction) => {
    for (const model of dependencyOrder(selected)) {
      for (const rawRow of backup.models[model.name] ?? []) {
        const row = reviveRow(model, rawRow);
        const id = String(row.id);
        const update = { ...row };
        delete update.id;
        delete update.organizationId;
        await delegate(transaction, model.name).upsert({ where: { id }, create: row, update });
        restored += 1;
      }
    }
  }, { timeout: 60_000 });
  return { restored, models: selected.length };
}
