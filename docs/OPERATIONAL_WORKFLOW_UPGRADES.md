# Fleet, Accounting, and HR operational workflows

## Fleet driver self-service

An organization administrator first invites the person from Administration with the Driver role, then links the active user to the Fleet driver profile. The Driver role receives `fleet.driver.self_service`, not fleet-management permissions.

The Driver Workspace shows only vehicles assigned to the linked driver. A driver can report maintenance through the existing ownership-checked workflow and submit weekly or work-and-pay collections. A collection remains pending and does not become a financial fleet payment until a user with `fleet.payments.manage` approves it. Approval creates a verified `FleetPayment` in the same database transaction. Rejection preserves the original submission.

## Accounting cash and bank controls

Ledger accounts can be classified as Cash, Bank, Mobile Money, or non-liquidity accounts. The Cash and Bank workspace derives its cashbook from double-entry journal lines rather than a separate editable balance.

Opening balances are posted once per account as balanced entries against Opening Balance Equity. They are not directly editable; corrections require a reversing journal entry. Reconciliation records preserve the statement balance, ledger balance, difference, period, completion identity, time, and notes. A non-zero difference is visibly flagged and remains in history.

## HR termination and reinstatement

Direct one-click termination is disabled. The controlled workflow requires employee selection, category, reason, last working date, effective date, access decision, password confirmation, and an authenticator code when the administrator has 2FA enabled. Optional final salary, leave encashment, severance, deductions, benefits, notes, and a file-asset reference can be recorded.

Statuses include Onboarding, Active, On Leave, Suspended, Termination Pending, Terminated, and Reinstated. Future approved terminations become effective through the authenticated daily operations job. Effective termination prevents later ordinary payroll inclusion. Final settlement values remain attached to the termination record for processing and audit.

Maker-checker approval is enabled by default. The initiator cannot approve their own request. Smaller organizations can disable approval in HR Settings. Pending or approved requests can be cancelled with a reason. Effective terminations can be reversed only by reinstatement. Original records remain intact.

Each request creates an offboarding checklist covering access, assets, work transfer, leave, final salary, deductions, benefits and statutory obligations, documents, physical and digital access, and retention. Every transition and task update is tenant-scoped and audited.

## Permission boundaries

New permissions are seeded for Fleet driver self-service, Accounting cashbook and reconciliation, and HR employee view/edit, termination initiation/approval, reinstatement, sensitive documents, and exports. Existing `hr.employees.manage` remains temporarily accepted for ordinary employee editing so established custom roles do not lose access during the transition. Termination approval and reinstatement require their new explicit permissions.
