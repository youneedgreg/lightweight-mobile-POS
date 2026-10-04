import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source, so Next compiles it.
  transpilePackages: ["@liquor-pos/shared"],

  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    // Dev only: lets the Expo web preview (another localhost port) call the mobile API.
    // Native apps don't use CORS, so production needs none of this.
    return [
      {
        source: "/api/mobile/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:8081" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "authorization,content-type" },
        ],
      },
    ];
  },
};

export default nextConfig;
