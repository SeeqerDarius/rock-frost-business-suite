import type { CredentialStore } from "@/security/credential-store";
import { InMemoryCredentialStore, TauriCredentialStore } from "@/security/credential-store";

function isRunningInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Mirrors src/db/create-local-database.ts's runtime selection — see that file's doc comment for why. */
export function createCredentialStore(): CredentialStore {
  return isRunningInTauri() ? new TauriCredentialStore() : new InMemoryCredentialStore();
}
