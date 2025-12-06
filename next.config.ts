import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Force pino to use its browser build so Turbopack/webpack avoid bundling
  // Node-only files from thread-stream that break the client bundle.
  turbopack: {
    resolveAlias: {
      pino: "pino/browser",
    },
  },
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
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      pino: "pino/browser",
    };
    return config;
  },
};

export default nextConfig;
