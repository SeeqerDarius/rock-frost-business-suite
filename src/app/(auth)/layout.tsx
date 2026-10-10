import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Secure account access",
  description: "Secure access to Rock Frost Business Suite.",
  robots: { index: false, follow: false, nocache: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <main id="main-content" tabIndex={-1} className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
        <Logo />
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
