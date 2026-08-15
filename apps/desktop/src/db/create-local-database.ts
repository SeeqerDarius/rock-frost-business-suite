import type { LocalDatabase } from "@/db/local-database";
import { MemoryLocalDatabase } from "@/db/memory-database";
import { TauriLocalDatabase } from "@/db/tauri-database";

/** True only inside a real Tauri webview — injected by Tauri's runtime before any app code runs. Absent in a plain browser (`npm run dev` preview) and in the Vitest/jsdom test environment. */
function isRunningInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Selects the real, encrypted-SQLite-backed database when running inside
 * the Tauri shell, or the in-memory one otherwise. A device is never
 * treated as activated, and no cached business data is ever trusted, when
 * this resolves to MemoryLocalDatabase — that only happens in a browser
 * preview or test run, never in a packaged build.
 */
export function createLocalDatabase(): LocalDatabase {
  return isRunningInTauri() ? new TauriLocalDatabase() : new MemoryLocalDatabase();
}
