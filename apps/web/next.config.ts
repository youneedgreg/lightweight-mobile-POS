import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source, so Next compiles it.
  transpilePackages: ["@liquor-pos/shared"],
};

export default nextConfig;
