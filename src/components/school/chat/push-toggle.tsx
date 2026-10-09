"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

type Capability = "pending" | "unsupported" | "denied" | "ok";
const noopSubscribe = () => () => {};

function detectCapability(): Capability {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return Notification.permission === "denied" ? "denied" : "ok";
}

/**
 * Opt-in browser or phone notifications for new chat messages on this
 * device. Uses the app's service worker; nothing is sent until the person
 * turns it on and the browser grants permission. Hidden when push is not
 * configured on the server or the browser cannot do it.
 */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const capability = useSyncExternalStore(noopSubscribe, detectCapability, () => "pending" as Capability);
  const [subscription, setSubscription] = useState<"unknown" | "on" | "off" | "working" | "denied">("unknown");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey || capability !== "ok") return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => { if (!cancelled) setSubscription(existing ? "on" : "off"); })
      .catch(() => { if (!cancelled) setSubscription("off"); });
    return () => { cancelled = true; };
  }, [publicKey, capability]);

  async function enable() {
    setError(null);
    setSubscription("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setSubscription(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.ready;
      const current = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) }));
      const response = await fetch("/api/push/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current.toJSON()) });
      if (!response.ok) throw new Error("save failed");
      setSubscription("on");
    } catch {
      setError("Notifications could not be turned on. Try again.");
      setSubscription("off");
    }
  }

  async function disable() {
    setError(null);
    setSubscription("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await fetch("/api/push/subscription", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: current.endpoint }) });
        await current.unsubscribe();
      }
      setSubscription("off");
    } catch {
      setSubscription("on");
    }
  }

  if (!publicKey || capability === "pending" || capability === "unsupported") return null;
  if (capability === "denied" || subscription === "denied") {
    return <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><BellOff className="size-3.5" />Notifications are blocked in your browser settings.</p>;
  }
  return (
    <div className="text-xs">
      {subscription === "on" ? (
        <button type="button" onClick={disable} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Bell className="size-3.5" />Notifications on for this device. Turn off</button>
      ) : (
        <button type="button" onClick={enable} disabled={subscription === "working" || subscription === "unknown"} className="flex items-center gap-1.5 font-medium text-primary hover:underline disabled:opacity-60"><Bell className="size-3.5" />Get notified of new messages</button>
      )}
      {error ? <p className="mt-1 text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
