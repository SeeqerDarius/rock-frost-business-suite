"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

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
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading the next page"
      aria-busy="true"
      className="fixed inset-0 z-[100] cursor-progress"
    >
      <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/10">
        <span className="block h-full w-1/2 animate-pulse rounded-r-full bg-primary shadow-md" />
      </div>
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-2xl border bg-background/90 px-5 py-4 shadow-2xl backdrop-blur-md">
        <div className="relative flex size-11 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <Image src="/icon.png" alt="" width={34} height={34} priority className="relative rounded-lg" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Loading workspace</p>
          <p className="text-xs text-muted-foreground">Your current page will stay visible.</p>
        </div>
      </div>
    </div>
  );
}
