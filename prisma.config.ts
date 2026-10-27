import { defineConfig, env } from "prisma/config";

// Prisma 7 does not read .env by itself; fall back to the real environment when absent.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
  migrations: { path: "prisma/migrations" },
});
