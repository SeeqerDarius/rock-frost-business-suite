import type { Metadata } from "next";
import type { ReactNode } from "react";
import DashboardAuthProtection from "./auth-protection";

export const metadata: Metadata = {
  title: "Dashboard | Rock Frost",
  description: "Premium multi-module business dashboard for Rock Frost Business Suite.",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardAuthProtection>
      <div className="min-h-screen bg-[#020409] text-slate-100">{children}</div>
    </DashboardAuthProtection>
  );
}
