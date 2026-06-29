"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "Modules", href: "/modules" },
  { label: "Pricing", href: "/pricing" },
  { label: "Industries", href: "/industries" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const menuClass = useMemo(
    () => (open ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"),
    [open],
  );

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8">
        <Link href="/" className="font-semibold tracking-[0.18em] text-white">
          ROCK FROST
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-zinc-300 transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link href="/login" className="text-sm text-zinc-300 transition hover:text-white">
            Login
          </Link>
          <Link
            href="/contact"
            className="hidden rounded-full border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20 md:inline-flex"
          >
            Request Demo
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10 md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="Toggle menu"
        >
          <span className="text-xl">{open ? "×" : "☰"}</span>
        </button>
      </div>

      <div className={`absolute inset-x-0 top-full bg-slate-950/95 px-6 pb-6 pt-4 shadow-2xl shadow-slate-950/40 transition duration-300 md:hidden ${menuClass}`}>
        <div className="space-y-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            Login
          </Link>
          <Link
            href="/contact"
            className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
            onClick={() => setOpen(false)}
          >
            Request Demo
          </Link>
        </div>
      </div>
    </header>
  );
}
