"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RfLoadingScreen } from "@/components/feedback/rf-loading-screen";

const MIN_VISIBLE_MS = 260;
const SAFETY_TIMEOUT_MS = 8000;

export function AppNavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeKeyRef = useRef(`${pathname}?${searchParams.toString()}`);

  function clearTimers() {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }

  function finish() {
    clearTimers();
    hideTimerRef.current = setTimeout(() => setVisible(false), 100);
  }

  useEffect(() => {
    function start(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;

      clearTimers();
      shownAtRef.current = Date.now();
      setVisible(true);
      safetyTimerRef.current = setTimeout(finish, SAFETY_TIMEOUT_MS);
    }

    document.addEventListener("click", start, true);
    return () => {
      document.removeEventListener("click", start, true);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const routeKey = `${pathname}?${searchParams.toString()}`;
    if (routeKey === routeKeyRef.current) return;
    routeKeyRef.current = routeKey;
    if (shownAtRef.current === null) return;

    const elapsed = Date.now() - shownAtRef.current;
    shownAtRef.current = null;
    if (elapsed >= MIN_VISIBLE_MS) finish();
    else hideTimerRef.current = setTimeout(finish, MIN_VISIBLE_MS - elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (!visible) return null;
  return <RfLoadingScreen />;
}
