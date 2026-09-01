# Offline Capability Matrix

This matrix is the authoritative current state. “Planned” means unavailable in the product today.

| Module or workspace | Cached/read-only | Offline capture | Server confirmation and conflict rule | Status |
| --- | --- | --- | --- | --- |
| Shared shell | Manifest, icons, offline fallback, authorized workspace identity and module list | None | New worker activates only after user confirmation | Implemented |
| POS | Current page data remains usable while the loaded page stays open | Completed or suspended sale can enter the IndexedDB outbox only on an authorized device with an unexpired lease and open mutation flag | Register, catalog, payment totals, stock, session, idempotency, revenue posting, and audit are revalidated. Stock or session changes become conflicts. The UI says awaiting synchronization | Implemented, guarded rollout |
| Fleet driver | Assigned vehicle, obligation, targets, schedule, history | Fault reports, evidence, and payment declarations | Assignment and obligation period require server revalidation. Declarations remain unverified | Planned |
| Fleet mechanic | Assigned maintenance work packs | Notes, progress, photos, invoice references, completion evidence | Repair verification and expense posting require server confirmation | Planned |
| Vehicle owner | Vehicle, collection, expense, maintenance, settlement snapshots | Maintenance approval request only | Approval remains pending until permission and workflow state are revalidated | Planned |
| Inventory and procurement | Catalog and bounded warehouse work packs | Counts, receipts, requisition drafts | Never replace stock totals. Quantity, batch, order, and approval changes require review | Planned |
| Accounting | Timestamped report snapshots | Invoice, bill, expense, and manual-journal drafts | No posting, approval, reconciliation, close, allocation, or tax finalization offline | Planned |
| School | Downloaded attendance work packs | Attendance and safe student or guardian drafts | Duplicate and correction rules are revalidated. Billing and payments remain pending | Planned |
| Hostel | Bounded resident and room snapshots | Safe drafts only | Fees, allocations, and bed changes require live validation | Planned |
| Hotel | Reservation, room, and housekeeping work packs | Housekeeping notes and status evidence | Check-in, room assignment, folio payment, and checkout require live validation | Planned |
| Pharmacy | Stale-labelled, minimized read-only snapshot | Safe drafts only | No dispensing, controlled-drug approval, or fulfilment offline | Planned |
| Hospital | Stale-labelled, minimized read-only snapshot | Safe drafts only | No verified results, diagnosis finalization, medication fulfilment, or occupancy change offline | Planned |
| Other modules | No offline work pack | None | Online only until a documented adapter and conflict policy ships | Planned |

The organization policy is stored at `Organization.metadata.offlineAccess`. `enabled` gates registration, `moduleKeys` scopes device authorization, `leaseHours` bounds offline use, and `mutationKillSwitch` prevents new captures while allowing already queued records to synchronize.
