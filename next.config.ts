import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://vitals.vercel-insights.com https://*.vercel-insights.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit reads its standard-font metrics (data/*.afm) relative to __dirname.
  // Bundled, __dirname becomes a placeholder path that does not exist at
  // runtime, so every PDF failed with ENOENT on Helvetica.afm. Loading it
  // natively from node_modules keeps the real path (the files are traced).
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/app/school/**/*": ["node_modules/@img/sharp*/**/*"],
    "/api/school/**/*": ["node_modules/@img/sharp*/**/*"],
  },
  async redirects() {
    return [
      { source: "/modules/payroll", destination: "/modules/hr", permanent: true },
      { source: "/modules/procurement", destination: "/modules/inventory", permanent: true },
      // School conversations became School chat (2026-10-09).
      { source: "/app/school/messages/:path*", destination: "/app/school/chats", permanent: false },
      { source: "/app/school/portal/messages/:path*", destination: "/app/school/chats", permanent: false },
    ];
  },
  experimental: {
    serverActions: {
      // Profile photos are capped at 1 MiB by application validation, but the
      // multipart Server Action envelope adds headers/metadata above that size.
      // School chat attachments are capped at 4 MB (src/lib/school-chat-attachment.ts).
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
