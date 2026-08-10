"use client";

import { useEffect, useRef, useState } from "react";
import { RfLoadingScreen } from "@/components/feedback/rf-loading-screen";

const VISIBLE_MS = 650;

export function AppNavigationLoader() {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      if (timer.current) clearTimeout(timer.current);
      setVisible(true);
      timer.current = setTimeout(() => setVisible(false), VISIBLE_MS);
    }

    document.addEventListener("click", start, true);
    return () => {
      document.removeEventListener("click", start, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm" aria-busy="true">
      <RfLoadingScreen />
    </div>
  );
}
