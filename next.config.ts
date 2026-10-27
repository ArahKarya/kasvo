import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be opened as 127.0.0.1 too (a separate cookie jar from localhost).
  allowedDevOrigins: ["127.0.0.1"],
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
