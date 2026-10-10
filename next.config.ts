import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow opening the app via 127.0.0.1 in local dev (HMR / assets).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Don't advertise the framework to attackers.
  poweredByHeader: false,
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
  async redirects() {
    return [
      // Payrexx lebt seit dem Finance-Ausbau unter /finance/payrexx.
      { source: "/payrexx", destination: "/finance/payrexx", permanent: true },
      {
        source: "/payrexx/:path*",
        destination: "/finance/payrexx/:path*",
        permanent: true,
      },
    ];
  },
  // Baseline security headers for every response. Route-specific headers
  // (e.g. the permissive CSP on /ads/frame) are not overridden by these.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
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
