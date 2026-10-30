import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be opened as 127.0.0.1 too (a separate cookie jar from localhost), plus any
  // LAN address in KASVO_DEV_ORIGINS so a phone or the Capacitor app can reach `pnpm dev:lan`.
  allowedDevOrigins: ["127.0.0.1", ...(process.env.KASVO_DEV_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)],
  // Uploads are capped in the services (CSV 2 MB, statement PDF 3 MB, attachment 5 MB); leave room for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
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
