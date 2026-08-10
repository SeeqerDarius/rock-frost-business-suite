import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Profile photos are capped at 1 MiB by application validation, but the
      // multipart Server Action envelope adds headers/metadata above that size.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
