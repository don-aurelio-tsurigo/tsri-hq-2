import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow opening the app via 127.0.0.1 in local dev (HMR / assets).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
