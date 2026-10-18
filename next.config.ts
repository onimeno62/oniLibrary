import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 → produces a fully static `out/` directory
 * used to bundle the oniLibrary APK (Android WebView assets).
 */
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isStatic ? "export" : "standalone",
  images: isStatic
    ? { unoptimized: true }
    : {
        // dev-only: next/image rejects foreign hosts without this; the APK
        // static export runs unoptimized so it never applies there
        remotePatterns: [
          { protocol: "https", hostname: "uploads.mangadex.org" },
          { protocol: "https", hostname: "www.gutenberg.org" },
        ],
      },
  // BLD-02: type errors must fail builds — never mask them
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
