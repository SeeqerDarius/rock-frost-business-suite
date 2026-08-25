"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  type CookieConsent,
  COOKIE_CONSENT_CHANGED_EVENT,
  OPEN_COOKIE_SETTINGS_EVENT,
  readCookieConsent,
  serializeCookieConsent,
} from "@/lib/cookie-consent";

const Analytics = dynamic(
  () => import("@vercel/analytics/next").then((module) => module.Analytics),
  { ssr: false },
);
const SpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then((module) => module.SpeedInsights),
  { ssr: false },
);

export function ConsentManagedAnalytics({ initialConsent }: { initialConsent: CookieConsent | null }) {
  const consent = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, onStoreChange);
      return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, onStoreChange);
    },
    () => readCookieConsent(document.cookie),
    () => initialConsent,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const openSettings = () => setIsSettingsOpen(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  function saveConsent(nextConsent: CookieConsent) {
    document.cookie = serializeCookieConsent(nextConsent, window.location.protocol === "https:", window.location.hostname);
    window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT));
    setIsSettingsOpen(false);
  }

  return (
    <>
      {consent === "analytics" ? (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      ) : null}

      {consent === null || isSettingsOpen ? (
        <section
          aria-label="Cookie preferences"
          className="fixed inset-x-4 bottom-4 z-[120] mx-auto max-w-2xl rounded-xl border bg-background p-5 shadow-2xl sm:p-6"
        >
          <h2 className="text-base font-semibold">Your privacy choices</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            We use essential cookies for secure sign-in and core features. With your permission, we also use privacy-focused analytics and performance measurements to improve the service. Optional analytics stays off unless you accept it.
          </p>
          <p className="mt-2 text-sm">
            <Link className="font-medium text-primary underline underline-offset-4" href="/cookie-policy">
              Read our cookie policy
            </Link>
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button variant="outline" size="lg" onClick={() => saveConsent("essential")}>
              Essential only
            </Button>
            <Button size="lg" onClick={() => saveConsent("analytics")}>
              Accept optional analytics
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
