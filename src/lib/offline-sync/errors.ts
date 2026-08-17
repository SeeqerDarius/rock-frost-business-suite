import "server-only";

export class OfflineMutationDeniedError extends Error {}

export class OfflineMutationConflictError extends Error {
  constructor(message: string, public readonly conflictType: string) {
    super(message);
  }
}
