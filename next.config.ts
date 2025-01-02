import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { // [!code ++] // [!code focus]
    serverComponentsExternalPackages: ['grammy'], // [!code ++] // [!code focus]
  }, // [!code ++] // [!code focus]
};

export default nextConfig;
