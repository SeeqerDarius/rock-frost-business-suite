"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Logo } from "./Logo";

const navItems: readonly { label: string; href: Route }[] = [
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
  const menuClass = open ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0";

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8">
        <Logo />

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">
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
            className="hidden btn-blue rounded-full px-5 py-3 text-sm font-semibold text-white md:inline-flex"
          >
            Request Demo
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10 md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          <span className="text-xl">{open ? "×" : "☰"}</span>
        </button>
      </div>

      <div
        id="mobile-navigation"
        className={`absolute inset-x-0 top-full bg-slate-950/95 px-6 pb-6 pt-4 shadow-2xl shadow-slate-950/40 transition duration-300 md:hidden ${menuClass}`}
      >
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
            className="rounded-2xl btn-blue px-4 py-3 text-sm font-semibold text-white"
            onClick={() => setOpen(false)}
          >
            Request Demo
          </Link>
        </div>
      </div>
    </header>
  );
}
