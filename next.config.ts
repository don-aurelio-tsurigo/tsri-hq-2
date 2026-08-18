import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow opening the app via 127.0.0.1 in local dev (HMR / assets).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["sharp", "exifr", "heic-convert", "heic-decode", "libheif-js"],
  outputFileTracingIncludes: {
    "/api/dam/**/*": [
      "./node_modules/heic-decode/**/*",
      "./node_modules/libheif-js/**/*",
    ],
  },
  experimental: {
    // Phone camera JPEGs are often >10 MB; the default proxy/action limit
    // makes request.formData() / arrayBuffer() throw on the DAM fallback.
    proxyClientMaxBodySize: "45mb",
    serverActions: { bodySizeLimit: "45mb" },
  },
};

export default nextConfig;
