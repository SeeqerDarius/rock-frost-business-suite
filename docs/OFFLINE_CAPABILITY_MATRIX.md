# Offline Capability Matrix

This matrix describes the implemented feature-flagged release candidate. Production availability still depends on the final release gates.

| Module or workspace | Cached or read-only | Offline capture | Authoritative confirmation and conflict rule |
| --- | --- | --- | --- |
| Shared shell | Public shell, static runtime, workspace identity, permissions, navigation, downloaded work packs | Safe drafts from the restarted offline shell | Worker updates are user-controlled. Leases, device status, membership, permissions, and module access are rechecked. |
| POS | Authorized catalogue already loaded by the sell workspace | Completed or suspended sales from an online-opened register session | Price, item, payment, register session, stock, idempotency, revenue posting, and audit are revalidated. Stock or session changes conflict. Gateway checkout is unavailable offline. |
| Fleet driver | Assigned vehicle, obligations, targets, Work and Pay schedule, recent submissions | Fault reports, photos, and payment declarations | Current assignment, vehicle version, obligation period, evidence, and duplicates are revalidated. A declaration remains awaiting manager verification. |
| Fleet mechanic | Assigned maintenance work packs | Safe notes, progress, evidence, invoice-reference, and completion drafts with attachments | Verification and expense posting remain online-only. Stale workflow state requires review. |
| Vehicle owner | Vehicle, verified collections, expenses, maintenance, settlement, and last-sync snapshot | Maintenance approval or rejection requests | Owner identity, permission, request version, and workflow state are revalidated. The decision remains pending until accepted. |
| Inventory and procurement | Catalogues, warehouses, stock references, bounded draft count packs | Versioned count lines and safe receipt or requisition drafts | No stale total overwrites stock. Quantity, batch, purchase-order, and approval conflicts require review. Posting remains online. |
| Accounting | Timestamped accounts and posted-journal snapshots | Invoice, bill, expense, and manual-journal safe drafts | Drafts cannot post, approve, reconcile, close a period, allocate payment, finalize tax, or count as revenue. |
| School | Classes, terms, enrolled attendance rosters | Versioned attendance and safe student or guardian drafts | Teacher scope, enrollment, date window, corrections, and duplicates are revalidated. Billing and payments remain pending or online-only. |
| Hostel | Buildings, rooms, beds, and active resident allocations | Safe drafts | Fees, allocations, and bed changes require live validation and are not applied offline. |
| Hotel | Rooms, reservations, and housekeeping tasks | Versioned housekeeping status plus safe notes or evidence drafts | Task version and inspection rules are revalidated. Check-in, room assignment, folio payment, and checkout remain online-only. |
| Pharmacy | Minimized medicine reference snapshot, prominently stale | Safe drafts only | No stock dispensing, controlled-drug approval, prescription fulfilment, or payment confirmation offline. |
| Hospital | Minimized facility snapshot, prominently stale | Safe drafts only | No verified results, imaging verification, diagnosis finalization, medication fulfilment, payment confirmation, admission, or bed movement offline. |
| Other modules | None | None | Online-only until a documented adapter and conflict policy are released. |

The organization policy is stored in `Organization.metadata.offlineAccess`. `enabled` gates registration, `moduleKeys` scopes authorization, `leaseHours` bounds local use, and `mutationKillSwitch` prevents new capture while allowing queued replay.
