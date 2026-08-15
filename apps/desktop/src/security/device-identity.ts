/**
 * A stable, locally-generated identifier for this installation, used as
 * `deviceId` in ActivateDeviceRequest and every subsequent sync call. This
 * is not a secret — it's a label the server uses to name/list/revoke the
 * device (see docs on ActivateDeviceRequest in contract/sync-contract.ts) —
 * so it's fine to keep in the webview's own localStorage rather than the
 * OS credential store, and it must exist even before the user has signed
 * in (the activation screen needs it for the very first request).
 */

const STORAGE_KEY = "rockfrost.desktop.deviceId";

export function getOrCreateDeviceId(storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  storage.setItem(STORAGE_KEY, generated);
  return generated;
}

export function getDeviceDisplayName(): string {
  // A human-recognizable default the user can rename during activation —
  // deliberately not exposing raw OS hostnames or usernames beyond what
  // the browser/webview already reveals here.
  const platform = typeof navigator !== "undefined" ? navigator.platform : "Windows";
  return `Rock Frost Desktop (${platform || "Windows"})`;
}
