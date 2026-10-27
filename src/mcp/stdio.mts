/**
 * Kasvo MCP server over stdio, for Claude Code / Claude Desktop.
 *
 *   KASVO_TOKEN=kv_... pnpm --silent --dir /path/to/kasvo mcp
 *
 * stdout carries the protocol, so anything human-readable goes to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // no .env next to the repo; rely on the environment
}

async function main(): Promise<void> {
  // Imported after the env is loaded, because the db client reads DATABASE_URL on import.
  const { verifyToken } = await import("@/server/domain/tokens");
  const { contextFor } = await import("@/mcp/context");
  const { createKasvoServer } = await import("@/mcp/server");

  const raw = process.env.KASVO_TOKEN;
  if (!raw) throw new Error("KASVO_TOKEN is not set. Create a token in Kasvo → Settings → API tokens.");
  const identity = await verifyToken(raw);
  if (!identity) throw new Error("KASVO_TOKEN is invalid, revoked, or expired.");

  const server = createKasvoServer(await contextFor(identity));
  await server.connect(new StdioServerTransport());
  process.stderr.write(`kasvo mcp ready (token "${identity.name}", scopes ${identity.scopes.join(", ")})\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`kasvo mcp: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
