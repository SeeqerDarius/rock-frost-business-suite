"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CustomerShowcaseItem {
  id: string;
  name: string;
  industry: string | null;
  logoUrl: string;
  quote: string;
  attribution: string;
  /** Fictional demonstration entry — see src/lib/demo-showcase-customers.ts. */
  isDemo?: boolean;
}

const AVATAR_PALETTE = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

/** Deterministic, so the same organization always gets the same fallback color instead of flickering between renders. */
function paletteFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initialsFor(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Bounded logo frame: consistent dimensions and background regardless of the source logo's own aspect ratio, with a graceful initials fallback if the image is missing or fails to load, and a soft skeleton while a (sometimes sizeable, real-world-uploaded) logo is still in flight. */
function LogoFrame({ item }: { item: CustomerShowcaseItem }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(item.logoUrl ? "loading" : "failed");
  const imgRef = useRef<HTMLImageElement>(null);

  // The browser starts fetching an <img> the instant it parses the
  // server-rendered HTML — often before React finishes hydrating and
  // attaching onLoad/onError below, especially for these small, same-origin,
  // frequently-cached logos. If the load event already fired into the void
  // before the listener existed, it never fires again and the skeleton
  // would stay frozen forever. Checking `.complete` on mount catches that
  // race: it's true immediately whenever the image had already finished
  // (loaded or errored) by the time this effect runs.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete) {
      setStatus(img.naturalWidth > 0 ? "loaded" : "failed");
    }
  }, [item.logoUrl]);

  if (status === "failed") {
    return (
      <div
        className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-base font-semibold",
          paletteFor(item.name),
        )}
        aria-hidden="true"
      >
        {initialsFor(item.name)}
      </div>
    );
  }

  return (
    <div className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-xl border bg-muted/40 p-3 dark:bg-muted/20">
      {status === "loading" ? <div className="absolute inset-0 animate-pulse bg-muted-foreground/10" aria-hidden="true" /> : null}
      {/* Plain <img>, not next/image: logos are a mix of same-origin API
          routes (data URLs re-served with private caching) and local static
          SVGs, so there is no single stable width/height contract to
          declare, and next/image's optimizer does not accept SVG by
          default. object-contain preserves the source aspect ratio either
          way. Eagerly loaded (not `loading="lazy"`): these are small, and a
          handful of cards sit in or just past the initial viewport, where
          lazy-loading only adds a visible empty-frame flash for no benefit. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={item.logoUrl}
        alt={`${item.name} logo`}
        className={cn("relative max-h-full max-w-full object-contain transition-opacity duration-200", status === "loading" ? "opacity-0" : "opacity-100")}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("failed")}
      />
    </div>
  );
}

function CustomerCard({ item, index, total }: { item: CustomerShowcaseItem; index: number; total: number }) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}: ${item.name}`}
      className={cn(
        "flex h-full shrink-0 snap-start flex-col gap-4 rounded-2xl border bg-background p-6 shadow-sm",
        "basis-[86%] transition-shadow duration-200 hover:shadow-md sm:basis-[47%] lg:basis-[31.5%]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <LogoFrame item={item} />
        {item.isDemo ? (
          <Badge className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" variant="outline">
            Sample
          </Badge>
        ) : null}
      </div>

      <Quote className="size-5 shrink-0 text-primary/40" aria-hidden="true" />

      <blockquote className="flex-1 text-balance text-[0.95rem] leading-relaxed text-foreground/90">
        “{item.quote}”
      </blockquote>

      <div className="border-t pt-3">
        <p className="truncate font-medium">{item.attribution}</p>
        <p className="truncate text-sm text-muted-foreground">
          {item.name}
          {item.industry ? ` · ${item.industry}` : ""}
        </p>
      </div>
    </div>
  );
}

export function CustomerShowcase({
  customers,
  eyebrow = "Customer stories",
  headline = "Trusted by organizations building better operations",
  description = "Real organizations using management systems built by Rock Frost.",
  showDemoDisclosure = false,
}: {
  customers: CustomerShowcaseItem[];
  eyebrow?: string;
  headline?: string;
  description?: string;
  /** True when the current list includes at least one fictional demonstration entry. */
  showDemoDisclosure?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Keeps the position indicator/prev-next disabled state in sync with real
  // (touch/trackpad/keyboard) scrolling, not just button-driven moves.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || customers.length === 0) return;

    let frame: number | null = null;
    function computeActive() {
      if (!track) return;
      const cards = Array.from(track.children) as HTMLElement[];
      if (cards.length === 0) return;
      const trackLeft = track.scrollLeft;
      let closest = 0;
      let closestDistance = Infinity;
      cards.forEach((card, index) => {
        const distance = Math.abs(card.offsetLeft - trackLeft);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = index;
        }
      });
      setActiveIndex(closest);
    }

    function onScroll() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(computeActive);
    }

    computeActive();
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [customers.length]);

  if (customers.length === 0) return null;

  function scrollToIndex(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = (index + customers.length) % customers.length;
    const card = track.children[clamped] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollToIndex(activeIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToIndex(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      scrollToIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      scrollToIndex(customers.length - 1);
    }
  }

  const showControls = customers.length > 1;

  return (
    <section className="public-section-tint" aria-labelledby="customer-showcase-title">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h2 id="customer-showcase-title" className="mt-3 text-3xl font-semibold tracking-tight">
              {headline}
            </h2>
            <p className="mt-3 text-muted-foreground">{description}</p>
          </div>
          {showControls ? (
            <div className="flex shrink-0 gap-2 self-start sm:self-auto">
              <Button type="button" size="icon" variant="outline" aria-label="Previous customer story" onClick={() => scrollToIndex(activeIndex - 1)}>
                <ChevronLeft />
              </Button>
              <Button type="button" size="icon" variant="outline" aria-label="Next customer story" onClick={() => scrollToIndex(activeIndex + 1)}>
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </div>

        <div
          ref={trackRef}
          role="region"
          aria-roledescription="carousel"
          aria-label={headline}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {customers.map((customer, index) => (
            <CustomerCard key={customer.id} item={customer} index={index} total={customers.length} />
          ))}
        </div>

        {showControls ? (
          <div className="mt-6 flex justify-center gap-1.5" aria-hidden="true">
            {customers.map((customer, index) => (
              <button
                key={customer.id}
                type="button"
                tabIndex={-1}
                onClick={() => scrollToIndex(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === activeIndex ? "w-6 bg-primary" : "w-1.5 bg-primary/25 hover:bg-primary/40",
                )}
              />
            ))}
          </div>
        ) : null}

        {showDemoDisclosure ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Illustrative examples shown for demonstration. Verified customer stories will replace sample content as
            approvals are received.
          </p>
        ) : null}
      </div>
    </section>
  );
}
