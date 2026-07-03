import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import Topbar from "./Topbar";

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function DashboardShell({ title, subtitle, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen">
      <div className="lg:flex">
        <Sidebar />
        <div className="flex-1 bg-[#02050d]">
          <Topbar />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-8 rounded-3xl border border-white/10 bg-[#041026]/90 p-6 shadow-sm shadow-blue-500/5">
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.28em] text-cyan-200/80">{title}</p>
                <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
                {subtitle ? <p className="max-w-3xl text-sm leading-7 text-slate-300">{subtitle}</p> : null}
              </div>
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
