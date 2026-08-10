"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CustomerShowcaseItem {
  id: string;
  name: string;
  industry: string | null;
  logoUrl: string;
  quote: string;
  attribution: string;
}

export function CustomerShowcase({ customers }: { customers: CustomerShowcaseItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = customers[activeIndex];

  if (!active) return null;

  function move(direction: -1 | 1) {
    setActiveIndex((current) => (current + direction + customers.length) % customers.length);
  }

  return (
    <section className="border-y bg-muted/25" aria-labelledby="customer-showcase-title">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Customer stories</p>
          <h2 id="customer-showcase-title" className="mt-3 text-3xl font-semibold tracking-tight">
            Trusted by organizations building better operations
          </h2>
          <p className="mt-3 text-muted-foreground">Real organizations using Rock Frost Business Suite.</p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="grid items-stretch lg:grid-cols-[0.8fr_1.2fr]">
            <div className="flex min-h-64 items-center justify-center border-b bg-slate-950 p-10 lg:border-b-0 lg:border-r">
              <Image
                src={active.logoUrl}
                alt={`${active.name} logo`}
                width={320}
                height={160}
                unoptimized
                className="max-h-32 w-auto max-w-full object-contain"
              />
            </div>
            <div className="flex min-h-64 flex-col justify-between p-8 sm:p-10">
              <Quote className="size-8 text-primary/40" aria-hidden="true" />
              <blockquote className="mt-5 text-xl font-medium leading-relaxed sm:text-2xl">“{active.quote}”</blockquote>
              <div className="mt-7">
                <p className="font-semibold">{active.attribution}</p>
                <p className="text-sm text-muted-foreground">{active.name}{active.industry ? ` · ${active.industry}` : ""}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2" aria-label="Choose a customer story">
            {customers.map((customer, index) => (
              <button
                key={customer.id}
                type="button"
                aria-label={`Show ${customer.name}`}
                aria-pressed={index === activeIndex}
                onClick={() => setActiveIndex(index)}
                className="flex h-14 w-24 items-center justify-center rounded-lg border bg-slate-950 p-2.5 opacity-60 transition hover:opacity-100 aria-pressed:border-primary aria-pressed:opacity-100"
              >
                <Image src={customer.logoUrl} alt="" width={88} height={40} unoptimized className="max-h-9 max-w-full object-contain" />
              </button>
            ))}
          </div>
          {customers.length > 1 ? (
            <div className="flex gap-2">
              <Button type="button" size="icon" variant="outline" aria-label="Previous customer story" onClick={() => move(-1)}><ChevronLeft /></Button>
              <Button type="button" size="icon" variant="outline" aria-label="Next customer story" onClick={() => move(1)}><ChevronRight /></Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
