export const BACKUP_MODULES = [
  "accounting", "analytics", "crm", "fleet", "hospital", "hotel", "hr", "installment",
  "inventory", "payroll", "pos", "procurement", "projects", "school",
] as const;

export type BackupModule = (typeof BACKUP_MODULES)[number];
