import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Nécessaire pour GitHub Pages / export statique
    unoptimized: true,
    // Autoriser les images distantes (avatars Intuition, IPFS via gateway, etc.)
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
