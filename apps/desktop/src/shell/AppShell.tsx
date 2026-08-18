import { useEffect } from "react";
import { useApp } from "@/state/AppProvider";
import { AppSidebar } from "@/shell/AppSidebar";

/** Any of these DOM events counts as "the user is present" for the inactivity lock timer (security/device-lock.ts). Attached once at the shell root rather than per-component. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];

export function AppShell() {
  const { device, syncNow, recordActivity } = useApp();

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

  if (!device) return null;

  return <AppSidebar />;
}
