"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics/react";
import { readCookieConsent } from "@/lib/cookie-consent";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConversionProperties = Record<string, string | number | boolean | null>;

function trackWithConsent(name: string, properties: ConversionProperties) {
  if (readCookieConsent(document.cookie) === "analytics") {
    track(name, properties);
  }
}

export function ConversionButtonLink({
  href,
  children,
  variant = "default",
  size = "default",
  className,
  eventName,
  eventProperties,
}: {
  href: string;
  children: ReactNode;
  variant?: "default" | "outline";
  size?: "default" | "lg";
  className?: string;
  eventName: string;
  eventProperties: ConversionProperties;
}) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={() => trackWithConsent(eventName, eventProperties)}
    >
      {children}
    </Link>
  );
}

export function ConversionComplete({
  eventName,
  eventProperties,
}: {
  eventName: string;
  eventProperties: ConversionProperties;
}) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackWithConsent(eventName, eventProperties);
  }, [eventName, eventProperties]);

  return null;
}
