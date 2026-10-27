import { execSync } from "node:child_process";

/** Applies migrations to the test database once per run. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://kasvo:kasvo@localhost:5433/kasvo_test";
  execSync("pnpm prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
