# Pharmacy and Hospital vertical roadmap

## Pharmacy barcode integrity

Medicine and batch barcodes are optional but unique within an organization when supplied. Database constraints, not application-only prechecks, enforce this rule so simultaneous creates cannot produce ambiguous scanner results. The production migration fails with a clear message if historical duplicates exist and requires those records to be resolved before retrying deployment.

## Delivery order

Pharmacy is delivered and released first. Hospital starts only after Pharmacy passes schema migration, tenant-isolation, concurrency, backup/restore, RBAC, workflow, production-build, and live deployment gates. This prevents two clinically sensitive modules from being simultaneously half-built.

## Pharmacy production boundary

Pharmacy owns medicine/product registration, regulatory class, suppliers, purchase receipts, batch/lot and expiry stock, quarantine/recall, patients, prescribers, prescriptions, dispensing, payment records, restricted-medicine register, alerts, operational reports, and pharmacy-specific settings. It must enforce FEFO selection, prevent dispensing expired/quarantined/recalled stock, require a prescription for configured prescription-only classes, prevent negative batch stock under concurrency, and preserve immutable dispensing/restricted-register history through reversals rather than destructive edits.

Batch quarantine, recall, and release require an operator reason and create an audit event. Dispensing reversal is a compensating transaction: it preserves the original sale, appends controlled-register reversals, restores prescription balances and eligible stock, and never silently releases recalled or quarantined stock.

As of the clinical-upgrades tranche, medicines and batches carry a tenant-scoped barcode field with lookup functions (`findMedicineByBarcode`/`findBatchByBarcode`); a controlled-drug dispense can require a second person's approval (`PharmacySettings.controlledDispenseMakerCheckerEnabled`, default on) — the requester cannot approve or reject their own request, and no stock moves until approval; and an append-only `PharmacyStockMovement` ledger backs five reconciliation workflows (physical count, general adjustment, write-off, supplier return, patient return), each blocked from taking a batch negative unless `PharmacySettings.allowNegativeStock` is explicitly on. Patient returns are record-only — a returned medication is never automatically restocked as dispensable. See `docs/HOSPITAL_MODULE.md`'s "Clinical upgrades tranche" note and `OPERATOR_HANDOFF.md` for the exact branch and validation results.

It integrates with shared Accounting/POS/Procurement only through explicit service contracts. A tenant may use Pharmacy independently; enabling it does not require enabling those horizontal modules.

The product supports operational record keeping but does not itself grant a pharmacy licence, validate a clinician's professional registration, replace pharmacist judgement, submit statutory reports automatically, or certify regulatory compliance. Each deploying organization remains responsible for Pharmacy Council/FDA licensing, configuration, record-retention policy, and professional review.

## Hospital production boundary

Hospital will own patient identity/MRN, appointments, encounters, triage/vitals, clinical notes, diagnoses, orders, laboratory, imaging, nursing, beds/admissions/discharge, theatre, billing/insurance/claims, consent, referrals, and clinical reports. Medication orders will cross into Pharmacy through a versioned, idempotent prescription/dispensing contract: whichever side initiates the call includes a client-generated request id so a retried call (after a timeout, a redeploy, a duplicate webhook) applies once, never twice. As of the clinical-upgrades tranche (`docs/HOSPITAL_MODULE.md`) this idempotency requirement is documented but not built; `HospitalMedicationOrder.externalDispenseReference` remains a plain opaque string with no request-id semantics yet. Hospital delivery requires a separate clinical safety and privacy review before production activation.

## Offline deployment model

Offer an **on-premise local-server edition**, not uncontrolled copies of the cloud database on individual laptops. A small customer server runs the signed application build and PostgreSQL on the customer's LAN; browser clients connect over Wi-Fi/Ethernet and continue working without internet. Use encrypted disks, TLS, role-based accounts, audit logs, scheduled encrypted backups to removable/NAS storage, UPS power, health monitoring, and a documented restore drill.

Cloud synchronization should be optional and introduced only with stable globally unique IDs, an append-only outbox, idempotency keys, conflict policies, and explicit ownership of the authoritative site. Healthcare dispensing and stock decrements must not use naive bidirectional last-write-wins sync. For multi-branch offline customers, designate one authoritative server per branch and synchronize signed business events when connectivity returns. Licensing should use a renewable signed offline licence with a reasonable grace period, never a daily internet dependency.

## Recommended next vertical

After Pharmacy and Hospital, add **Clinic/Medical Laboratory Management** as a packaged lighter-weight healthcare edition. It reuses patient, encounter, billing, specimen, result, stock, and Pharmacy contracts, serves a broader group of smaller facilities than a full hospital system, and provides a safer commercial step before more specialized systems. Agriculture/Farm Management is the best non-healthcare follow-up because it expands the customer base without increasing clinical-data risk.
