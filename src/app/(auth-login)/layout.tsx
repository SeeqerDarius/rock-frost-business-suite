import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Secure access to Rock Frost Business Suite.",
  robots: { index: false, follow: false, nocache: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
