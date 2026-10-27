import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statement uploads are capped at 2 MB in the import service; leave room for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
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
