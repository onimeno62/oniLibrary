import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 → produces a fully static `out/` directory
 * used to bundle the oniLibrary APK (Android WebView assets).
 */
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isStatic ? "export" : "standalone",
  images: isStatic ? { unoptimized: true } : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
