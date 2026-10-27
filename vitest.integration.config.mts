import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Database-backed tests: `pnpm test:integration`. Uses TEST_DATABASE_URL, never the dev database. */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": dir("./tests/stubs/server-only.ts"),
      "@/generated": dir("./generated"),
      "@": dir("./src"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
