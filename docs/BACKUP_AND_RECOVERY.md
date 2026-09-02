# Backup and Recovery

Rock Frost provides organization administrators with portable, tenant-isolated module backups at `/app/organization/backups`.

## Application-level module backups

- An administrator with `org.settings.manage` can export all currently active module records or one currently active module in two formats. Excel (`.xlsx`) is a customer-readable reporting export with a summary sheet and one filtered worksheet per data model. JSON is the lossless system backup used by merge restore. The selector never offers inactive or unrelated modules.
- Active scope comes from current ACTIVE subscriptions when the organization has subscriptions. Trial and platform-managed workspaces without subscription records fall back to their enabled module assignments.
- Exports contain only models that carry the active `organizationId`; authentication records, password hashes, platform records, and every other tenant are excluded.
- Excel cells preserve dates, numbers, booleans, and readable JSON values; formula-like text is escaped to prevent spreadsheet formula injection. Excel exports are not accepted for restore because edited spreadsheets cannot preserve all relational and type fidelity safely.
- Accounting, Analytics, CRM, Fleet, Hospital, Hotel, HR, Installment, Inventory, Payroll, POS, Procurement, Projects, and School are valid scopes. Analytics currently owns no independent fact tables, so its scoped export is intentionally empty. Hospital (merged to `main`, live in production) required no bespoke backup code — it was added to `src/lib/backup/scopes.ts` and the `Hospital`-prefix entry in `src/lib/backup/tenant-backup.ts`'s model map, and every `Hospital*` table with `organizationId`/`id` is then auto-discovered by the existing generic export/restore logic.
- Restore accepts only a backup whose organization ID and tenant code exactly match the active organization. Every row is revalidated for that same organization, and every included model must belong to a module that is still active at restore time.
- Restore is a merge operation: matching IDs are updated and missing IDs are inserted. It does not delete records absent from the file.
- Restore requires the acting user's current password, the exact `RESTORE <tenant-code>` confirmation, and a valid authenticator code when that account has 2FA enabled. Files are limited to 4 MB and successful restores are audited.

This adapts the single-tenant GLV export/restore workflow rather than copying its whole-database replacement behavior. Whole-database replacement would allow one customer to affect platform identity, billing, or another organization and is prohibited.

## Infrastructure recovery

Customer-facing Human Resources & Payroll and Inventory & Procurement entitlements expand to both internal backup scopes. Existing JSON restore compatibility is preserved because the internal scope keys remain `hr`, `payroll`, `inventory`, and `procurement`; no tables or historical backup identifiers are renamed.

Application JSON backups and Excel exports complement, but do not replace, Neon branch/PITR and provider backup controls. Physical database recovery remains an operator-only incident procedure. Preview database branches are disposable deployment environments and are not production backups.
# Offline device recovery boundary

Offline browser data is a temporary operational queue, not a backup or recovery authority. Database recovery must preserve offline mutation idempotency, conflict, draft, attachment, and audit ledgers so reconnecting devices cannot duplicate accepted work. During recovery, disable new offline mutations, verify the restored migration and device state, replay a non-financial canary, then prove duplicate and protected-conflict handling before reopening tenant capture. The step-by-step procedure and rollback triggers are in `docs/OFFLINE_OPERATIONS_RUNBOOK.md`.
