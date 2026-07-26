import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export for Firebase Hosting (client-side Firebase + Drive GIS).
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
