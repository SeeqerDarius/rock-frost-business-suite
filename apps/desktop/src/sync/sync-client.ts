/**
 * Thin, typed HTTP layer over the five endpoints in
 * contract/sync-contract.ts. This is the only module in the whole app that
 * constructs a fetch() call to the cloud API — every other layer (sync
 * engine, module adapters, shell UI) goes through this class, never fetch
 * directly, so the error-classification and auth-header behavior below is
 * applied uniformly everywhere.
 */

import {
  classifyHttpStatus,
  SyncClientError,
  type ActivateDeviceRequest,
  type ActivateDeviceResponse,
  type DeactivateDeviceRequest,
  type DeactivateDeviceResponse,
  type ResolveConflictRequest,
  type ResolveConflictResponse,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
} from "@/contract/sync-contract";
import { computeBackoffDelayMs, DEFAULT_BACKOFF_OPTIONS, hasAttemptsRemaining, type BackoffOptions } from "@/sync/retry";

export interface SyncClientOptions {
  /** The public API origin only — e.g. https://api.rockfrostgroup.com. Never a database connection string; see .env.example. */
  apiBaseUrl: string;
  /** Supplies the current bearer token for every authenticated call. A function (not a static string) because the token can be refreshed mid-session by the caller without reconstructing this client. */
  getAccessToken: () => string | null;
  backoffOptions?: BackoffOptions;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * SyncClient never retries on its own for a *single* call — retry policy
 * (how many attempts, how long to wait) is the caller's decision, since
 * only the caller knows whether it's mid-user-interaction (retry once,
 * fail fast) or a background sync sweep (retry patiently). What this class
 * does own is classifying failures consistently via SyncClientError, and
 * providing `callWithRetry` as a convenience for callers who do want the
 * standard bounded backoff.
 */
export class SyncClient {
  private readonly apiBaseUrl: string;
  private readonly getAccessToken: () => string | null;
  private readonly backoffOptions: BackoffOptions;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: SyncClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.backoffOptions = options.backoffOptions ?? DEFAULT_BACKOFF_OPTIONS;
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async activateDevice(request: ActivateDeviceRequest): Promise<ActivateDeviceResponse> {
    // Deliberately not authenticated (no token exists yet) and never
    // retried automatically — a failed activation attempt must surface
    // immediately to the sign-in screen, not silently retry with the same
    // password payload in the background.
    return this.request<ActivateDeviceResponse>("POST", "/api/desktop/activate", request, { authenticated: false });
  }

  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    return this.request<SyncPushResponse>("POST", "/api/desktop/sync/push", request);
  }

  async pull(cursor: string): Promise<SyncPullResponse> {
    const query = new URLSearchParams({ cursor });
    return this.request<SyncPullResponse>("GET", `/api/desktop/sync/pull?${query.toString()}`);
  }

  async resolveConflict(conflictId: string, request: ResolveConflictRequest): Promise<ResolveConflictResponse> {
    return this.request<ResolveConflictResponse>("POST", `/api/desktop/sync/conflicts/${encodeURIComponent(conflictId)}/resolve`, request);
  }

  async deactivateDevice(request: DeactivateDeviceRequest): Promise<DeactivateDeviceResponse> {
    return this.request<DeactivateDeviceResponse>("POST", "/api/desktop/deactivate", request);
  }

  /** Runs `operation` (typically one of the methods above) with bounded exponential backoff + jitter for exactly the retryable error kinds. Non-retryable errors (expired_auth, revoked_or_unauthorized, conflict, invalid_request) are thrown on the first attempt. */
  async callWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await operation();
      } catch (error) {
        // See retry.ts's withBackoffRetry for why this checks attempt + 1
        // (total calls made so far) rather than the raw 0-indexed attempt —
        // maxAttempts is a total-calls cap, not "N retries on top of it".
        const retryable = error instanceof SyncClientError && error.retryable;
        if (!retryable || !hasAttemptsRemaining(attempt + 1, this.backoffOptions)) throw error;
        await this.sleepFn(computeBackoffDelayMs(attempt, this.backoffOptions));
        attempt += 1;
      }
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    options: { authenticated?: boolean } = {},
  ): Promise<T> {
    const authenticated = options.authenticated ?? true;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (authenticated) {
      const token = this.getAccessToken();
      if (!token) {
        throw new SyncClientError("expired_auth", "No access token available for an authenticated sync call.");
      }
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${this.apiBaseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      throw new SyncClientError("network_error", cause instanceof Error ? cause.message : "Network request failed.");
    }

    if (!response.ok) {
      const kind = classifyHttpStatus(response.status);
      const errorBody = await parseJsonSafely(response);
      const message =
        errorBody && typeof errorBody === "object" && "message" in errorBody && typeof errorBody.message === "string"
          ? errorBody.message
          : `Sync request to ${path} failed with status ${response.status}.`;
      throw new SyncClientError(kind, message, response.status);
    }

    return (await parseJsonSafely(response)) as T;
  }
}
