import type { Metadata } from "next";

export const siteUrl = new URL("https://rockfrostgroup.com");
export const siteName = "Rock Frost Technologies";
export const siteDescription =
  "Premium enterprise SaaS for African businesses with intelligent operations, payments, and growth tools.";
export const siteKeywords = [
  "Rock Frost",
  "business suite",
  "cloud ERP",
  "African business software",
  "business operations",
  "payments",
  "CRM",
  "HR",
  "accounting",
  "fleet management",
];

export const defaultMetadata: Metadata = {
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  metadataBase: siteUrl,
  keywords: siteKeywords,
  openGraph: {
    type: "website",
    title: siteName,
    description: siteDescription,
    url: siteUrl.toString(),
    siteName,
    locale: "en_US",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: ["/og-image.svg"],
  },
  icons: {
    icon: "/RFG.png",
    apple: "/RFG.png",
  },
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: siteUrl.toString(),
  },
  robots: {
    index: true,
    follow: true,
  },
};
