/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The public Rock Frost API origin, e.g. https://api.rockfrostgroup.com — never a database connection string. See .env.example. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Injected by the Tauri runtime before any app code runs; absent in a plain browser preview. See db/create-local-database.ts. */
  __TAURI_INTERNALS__?: unknown;
}
