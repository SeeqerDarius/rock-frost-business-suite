import { Logo } from "@/components/layout/logo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Secure account access",
  description: "Secure access to Rock Frost Business Suite.",
  robots: { index: false, follow: false, nocache: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
      <Logo />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
