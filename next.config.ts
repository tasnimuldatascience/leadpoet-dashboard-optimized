import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable the Next.js dev indicator (N icon)
  devIndicators: false,

  // Allow cross-origin requests from local network devices (for mobile testing)
  allowedDevOrigins: [
    'http://192.168.1.130:3000',
    'http://192.168.1.118:3000',
    'http://192.168.1.130',
    'http://192.168.1.118',
    '192.168.1.130',
    '192.168.1.118',
    'http://localhost:3000',
    'localhost',
  ],
  reactStrictMode: false,

  // Enable compression
  compress: true,

  // Note: instrumentation.ts is automatically picked up by Next.js 16+
  // It pre-warms the cache on server startup for faster initial loads
};

export default nextConfig;
