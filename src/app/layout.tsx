import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionProvider } from "@/components/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { ConsentManagedAnalytics } from "@/components/privacy/consent-managed-analytics";
import { COOKIE_CONSENT_NAME, type CookieConsent } from "@/lib/cookie-consent";
import { IconMotionController } from "@/components/icons/icon-motion-controller";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Business Management Software Ghana | Rock Frost",
    template: "%s | Rock Frost",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "Business software",
  creator: "Rock Frost Technologies",
  publisher: "Rock Frost Technologies",
  formatDetection: { email: false, address: false, telephone: false },
  manifest: "/manifest.webmanifest",
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const rawConsent = (await cookies()).get(COOKIE_CONSENT_NAME)?.value;
  const initialConsent: CookieConsent | null = rawConsent === "essential" || rawConsent === "analytics" ? rawConsent : null;

  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body>
        <IconMotionController />
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        <SessionProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
            <ConsentManagedAnalytics initialConsent={initialConsent} />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
