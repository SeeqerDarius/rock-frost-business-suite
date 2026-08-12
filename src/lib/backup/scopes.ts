export const BACKUP_MODULES = [
  "accounting", "analytics", "crm", "fleet", "hospital", "hotel", "hr", "installment",
  "inventory", "payroll", "pharmacy", "pos", "procurement", "projects", "school",
] as const;

export type BackupModule = (typeof BACKUP_MODULES)[number];
