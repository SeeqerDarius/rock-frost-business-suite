import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Fleet & Asset Management | Rock Frost",
  description: "Premium fleet and asset management dashboard for Rock Frost Business Suite.",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#020409] text-slate-100">{children}</div>;
}
