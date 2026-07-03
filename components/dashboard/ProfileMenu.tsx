"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

interface ProfileMenuProps {
  name: string;
  email?: string | null;
  role: string;
  organization: string;
}

export function ProfileMenu({ name, email, role, organization }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-3 rounded-3xl border border-white/10 bg-[#06111f]/90 px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-400/40"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 text-base font-semibold text-slate-950">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-white">{name}</p>
          <p className="text-xs text-slate-400">{role}</p>
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-3 w-56 rounded-3xl border border-white/10 bg-[#02050d]/95 p-3 shadow-lg shadow-black/20 backdrop-blur-xl">
          <div className="space-y-3 text-sm text-slate-200">
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Profile</p>
              <p className="font-semibold text-white">{name}</p>
              <p className="truncate text-xs text-slate-400">{email ?? "No email available"}</p>
            </div>
            <div className="space-y-2 border-t border-white/10 pt-3">
              <Link
                href={"/profile" as Route}
                onClick={() => setOpen(false)}
                className="block w-full rounded-2xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
              >
                Account settings
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-2xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
              >
                Support center
              </button>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full rounded-2xl bg-[#111827] px-3 py-2 text-left text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
