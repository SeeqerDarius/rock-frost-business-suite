/**
 * Client-side conflict-resolution policy. Two rules are enforced here:
 *
 *  1. The client never offers a resolution the server didn't explicitly
 *     allow for that specific conflict (SyncConflict.allowedResolutions is
 *     always the intersection point: this module only ever narrows it
 *     further, never widens it).
 *  2. For a fixed list of sensitive entity-type categories: payments,
 *     inventory movements, posted accounting records, payroll,
 *     prescriptions, and clinical data: every conflict requires an
 *     explicit user action through the conflict UI. There is no code path
 *     anywhere in this client (see sync/sync-engine.ts) that auto-resolves
 *     a conflict at all, so this is a structural guarantee, not just a
 *     policy check; this module exists to make that guarantee explicit,
 *     testable, and impossible to accidentally weaken later by adding an
 *     "auto-resolve trivial conflicts" shortcut for these categories.
 */

import type { ConflictResolutionChoice, OfflineModuleKey } from "@/contract/sync-contract";

const ALL_RESOLUTION_CHOICES: readonly ConflictResolutionChoice[] = ["KEEP_CLOUD"];

/**
 * Matched against `entityType` as a prefix. Deliberately broader than just
 * this pass's four shipped module adapters' entity types: this list is
 * the categories called out in the assignment brief verbatim, so it stays
 * correct even as more adapters are added later (accounting, payroll,
 * pharmacy/clinical are not yet built offline adapters at all, but this
 * policy must already refuse to silently resolve them the moment they
 * exist, without needing a matching code change here).
 */
const PROTECTED_ENTITY_TYPE_PREFIXES = [
  "fleet.driver_payment_submission",
  "installment.payment",
  "pos.sale",
  "inventory.movement",
  "accounting.",
  "payroll.",
  "pharmacy.prescription",
  "hospital.",
  "clinical.",
] as const;

export function isProtectedEntityType(entityType: string): boolean {
  return PROTECTED_ENTITY_TYPE_PREFIXES.some((prefix) => entityType.startsWith(prefix));
}

/** Every conflict in this client requires explicit user action: see the file-level doc comment. Exported (rather than inlined as `true`) so callers read as a policy decision, not a hardcoded assumption, and so a future genuinely-safe auto-resolvable category has one obvious place to be added. */
export function requiresExplicitResolution(_moduleKey: OfflineModuleKey, _entityType: string): boolean {
  return true;
}

/**
 * The resolution choices the UI may actually render as buttons for a given
 * conflict: the server's own allowedResolutions, narrowed to the client's
 * known valid choice set. Deliberately typed to accept plain `string[]`
 * rather than `ConflictResolutionChoice[]`: over the wire this is just
 * JSON, so nothing stops a server contract drift from sending a value
 * outside the client's known set, and that's exactly the case this
 * function exists to filter out rather than render as an unrecognized
 * action. ConflictRecord.allowedResolutions (db/schema.ts) is `string[]`
 * for the same reason.
 */
export function getPermittedResolutionChoices(conflict: { allowedResolutions: string[] }): ConflictResolutionChoice[] {
  return conflict.allowedResolutions.filter((choice): choice is ConflictResolutionChoice =>
    ALL_RESOLUTION_CHOICES.includes(choice as ConflictResolutionChoice),
  );
}
