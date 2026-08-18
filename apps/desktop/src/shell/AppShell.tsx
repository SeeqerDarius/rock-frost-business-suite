import { useEffect } from "react";
import { useApp } from "@/state/AppProvider";
import { AppSidebar } from "@/shell/AppSidebar";

/** Any of these DOM events counts as "the user is present" for the inactivity lock timer (security/device-lock.ts). Attached once at the shell root rather than per-component. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];

/** How often the shell auto-syncs while running, in addition to the mount-time sync and the manual "Sync now" button. Matches the cadence a user would reasonably expect from an "offline-first, syncs when it can" app - short enough that a newly queued change reaches the server within a minute of going online, long enough not to hammer the API from every open desktop client. */
const AUTO_SYNC_INTERVAL_MS = 60_000;

export function AppShell() {
  const { device, lockState, syncNow, recordActivity } = useApp();

  useEffect(() => {
    const handler = () => recordActivity();
    for (const eventName of ACTIVITY_EVENTS) window.addEventListener(eventName, handler, { passive: true });
    return () => {
      for (const eventName of ACTIVITY_EVENTS) window.removeEventListener(eventName, handler);
    };
  }, [recordActivity]);

  // A first sync as soon as the shell mounts (e.g. right after activation,
  // or on every app relaunch): in addition to the manual "Sync now"
  // button, so a returning user doesn't have to remember to press it.
  useEffect(() => {
    void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Without this, a change made after the mount-time sync above just sits
  // queued as "pending sync" until the user remembers to click "Sync now" -
  // there was previously no periodic resync at all. Skipped while the
  // device is locked, matching the manual button's own disabled state for
  // revoked/session-expired shells.
  useEffect(() => {
    if (lockState.locked) return;
    const interval = window.setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [lockState.locked, syncNow]);

  if (!device) return null;

  return <AppSidebar />;
}
