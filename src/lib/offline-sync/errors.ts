import "server-only";

export class OfflineMutationDeniedError extends Error {}

export class OfflineMutationConflictError extends Error {
  /**
   * cloudVersion/cloudSnapshot are populated only for the STALE_VERSION and
   * ENTITY_DELETED cases the UPDATE version check in adapters.ts throws
   * (see OfflineAdapterHandler.loadCurrentVersion in registry.ts) - the
   * only conflict types where there is a real, addressable cloud record to
   * report on. Every other conflict type (INVALID_PAYLOAD,
   * UNSUPPORTED_OPERATION, SERVER_STATE_CHANGED from a business-rule
   * rejection) has no single "current version" to attach, so both stay
   * null; the OfflineConflict.cloudVersion/cloudSnapshot columns are
   * nullable for exactly this reason.
   */
  constructor(
    message: string,
    public readonly conflictType: string,
    public readonly cloudVersion: number | null = null,
    public readonly cloudSnapshot: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}
