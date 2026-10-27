import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { contextFor } from "@/mcp/context";
import { createKasvoServer } from "@/mcp/server";
import { allow } from "@/server/rate-limit";
import { verifyToken } from "@/server/domain/tokens";

/** Requests per token per minute. */
const RATE_LIMIT = 120;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status, headers });
}

/**
 * Stateless Streamable HTTP endpoint: every POST builds a server scoped to the bearer
 * token's user and scopes, handles the message, and is discarded.
 */
export async function POST(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const identity = raw ? await verifyToken(raw) : null;
  if (!identity) {
    return jsonRpcError(401, "Missing or invalid Kasvo API token. Create one in Settings → API tokens.", { "WWW-Authenticate": 'Bearer realm="kasvo"' });
  }
  if (!allow(`mcp:${identity.tokenId}`, RATE_LIMIT, 60_000)) {
    return jsonRpcError(429, "Too many requests; slow down and retry in a minute.", { "Retry-After": "60" });
  }

  const server = createKasvoServer(await contextFor(identity));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

const notAllowed = (): Response => jsonRpcError(405, "Use POST.", { Allow: "POST" });
export const GET = notAllowed;
export const DELETE = notAllowed;
