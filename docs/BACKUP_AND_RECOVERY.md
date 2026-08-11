# Backup and Recovery

Rock Frost provides organization administrators with portable, tenant-isolated module backups at `/app/organization/backups`.

## Application-level module backups

- An administrator with `org.settings.manage` can export all currently active module records or one currently active module as JSON. The selector never offers inactive or unrelated modules.
- Active scope comes from current ACTIVE subscriptions when the organization has subscriptions. Trial and platform-managed workspaces without subscription records fall back to their enabled module assignments.
- Exports contain only models that carry the active `organizationId`; authentication records, password hashes, platform records, and every other tenant are excluded.
- Accounting, Analytics, CRM, Fleet, Hotel, HR, Installment, Inventory, Payroll, POS, Procurement, Projects, and School are valid scopes. Analytics currently owns no independent fact tables, so its scoped export is intentionally empty.
- Restore accepts only a backup whose organization ID and tenant code exactly match the active organization. Every row is revalidated for that same organization, and every included model must belong to a module that is still active at restore time.
- Restore is a merge operation: matching IDs are updated and missing IDs are inserted. It does not delete records absent from the file.
- Restore requires the acting user's current password, the exact `RESTORE <tenant-code>` confirmation, and a valid authenticator code when that account has 2FA enabled. Files are limited to 4 MB and successful restores are audited.

This adapts the single-tenant GLV export/restore workflow rather than copying its whole-database replacement behavior. Whole-database replacement would allow one customer to affect platform identity, billing, or another organization and is prohibited.

## Infrastructure recovery

Application JSON exports complement, but do not replace, Neon branch/PITR and provider backup controls. Physical database recovery remains an operator-only incident procedure. Preview database branches are disposable deployment environments and are not production backups.
