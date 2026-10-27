import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server bundle for the Fly.io Docker image.
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.qloo.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
