import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow opening the app via 127.0.0.1 in local dev (HMR / assets).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: [
    "sharp",
    "exifr",
    "heic-convert",
    "heic-decode",
    "libheif-js",
    "xlsx",
  ],
  // Prerender source maps default to on and spike RAM during `next build`.
  productionBrowserSourceMaps: false,
  enablePrerenderSourceMaps: false,
  outputFileTracingIncludes: {
    "/api/dam/**/*": [
      "./node_modules/heic-decode/**/*",
      "./node_modules/libheif-js/**/*",
    ],
  },
  experimental: {
    // Print TIFFs regularly exceed phone-JPEG sizes; keep proxy/action limits
    // aligned with MAX_FILE_BYTES (200 MB) so DAM fallback uploads succeed.
    proxyClientMaxBodySize: "200mb",
    serverActions: { bodySizeLimit: "200mb" },
    // Keep Render's 8 GB native-build cap from being blown by parallel workers.
    cpus: 1,
    memoryBasedWorkersCount: true,
    webpackMemoryOptimizations: true,
    serverSourceMaps: false,
  },
};

export default nextConfig;
