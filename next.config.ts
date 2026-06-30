import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this project. Without it, a stray
  // package-lock.json above the repo can cause Next to infer the wrong root.
  turbopack: { root: __dirname },
};

export default nextConfig;
