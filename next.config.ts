import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  reactStrictMode: true,
  turbopack: { root: __dirname },
};

export default nextConfig;
