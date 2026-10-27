import { ZodError } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DomainError } from "@/server/domain/errors";
import { formatMoney } from "@/server/domain/money";
import type { McpContext } from "./context";

/** Money as the agent sees it: a plain number for maths and a formatted string for people. */
export interface MoneyOut {
  value: number;
  text: string;
}

export const money = (ctx: McpContext, amount: bigint, currency = ctx.currency): MoneyOut => ({
  value: Number(amount),
  text: formatMoney(amount, currency, ctx.locale),
});

export const day = (d: Date): string => d.toISOString().slice(0, 10);

function ok(data: unknown): CallToolResult {
  const json = JSON.stringify(data, (_k, v: unknown) => (typeof v === "bigint" ? Number(v) : v), 2);
  return { content: [{ type: "text", text: json }], structuredContent: JSON.parse(json) as Record<string, unknown> };
}

function fail(code: string, message: string, hint?: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ code, message, hint }, null, 2) }] };
}

/** Runs a tool body and turns domain and validation errors into answers the agent can act on. */
export async function run(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await work());
  } catch (error: unknown) {
    if (error instanceof DomainError) return fail(error.code, error.message, error.hint);
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return fail("INVALID", `${issue?.path.join(".") || "input"}: ${issue?.message ?? "invalid"}`, "Fix that field and call the tool again.");
    }
    console.error("[mcp]", error);
    return fail("INTERNAL", "Unexpected server error.");
  }
}
