export const MODULE_PRODUCT_GROUPS = {
  hr: ["hr", "payroll"],
  inventory: ["inventory", "procurement"],
} as const;

export function productGroupKeys(moduleKey: string): readonly string[] {
  return Object.values(MODULE_PRODUCT_GROUPS).find((keys) => keys.includes(moduleKey as never)) ?? [moduleKey];
}

export function expandProductModuleKeys(moduleKeys: readonly string[]): string[] {
  const expanded = new Set(moduleKeys);
  for (const moduleKey of moduleKeys) {
    for (const groupedKey of productGroupKeys(moduleKey)) expanded.add(groupedKey);
  }
  return [...expanded];
}

export function primaryProductKey(moduleKey: string): string {
  const entry = Object.entries(MODULE_PRODUCT_GROUPS).find(([, keys]) => keys.some((key) => key === moduleKey));
  return entry?.[0] ?? moduleKey;
}

export function isCatalogueModule(moduleKey: string) {
  return !Object.entries(MODULE_PRODUCT_GROUPS).some(
    ([primary, keys]) => primary !== moduleKey && keys.includes(moduleKey as never),
  );
}
