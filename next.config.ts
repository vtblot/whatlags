import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["systray2", "systeminformation"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
