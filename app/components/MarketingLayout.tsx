import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

interface MarketingLayoutProps {
  className?: string;
  children: ReactNode;
}

export function MarketingLayout({ className = "", children }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_20%),linear-gradient(180deg,_#020307_0%,_#070b13_35%,_#020306_100%)] text-white">
      <Navbar />
      <main className={`mx-auto px-6 py-16 sm:px-8 lg:px-10 ${className}`}>{children}</main>
      <Footer />
    </div>
  );
}
