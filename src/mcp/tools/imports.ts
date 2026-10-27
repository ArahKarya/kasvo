import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { commitImport, discardImport, stageFile, stagePdf, stageRows } from "@/server/domain/import/service";
import { getImport, listImports } from "@/server/domain/import/queries";
import { applyRules, createRule, listRules } from "@/server/domain/rules";
import { DomainError } from "@/server/domain/errors";
import type { McpContext } from "../context";
import { day, money, run } from "../result";
import { resolveAccount, resolveCategory } from "../resolve";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

/** Statement import and categorization rules. Read tools need `read`, the rest `write`. */
export function registerImportTools(server: McpServer, ctx: McpContext): void {
  const userId = ctx.actor.userId;

  server.registerTool(
    "kasvo_list_imports",
    { title: "List imports", description: "Recent statement imports with status (STAGED, NEEDS_MAPPING, COMMITTED, REVERTED) and row counts.", annotations: READ },
    () =>
      run(async () => ({
        imports: (await listImports(userId, 30)).map((b) => ({
          id: b.id,
          account: b.accountName,
          format: b.format,
          fileName: b.fileName,
          status: b.status,
          rows: b.rowCount,
          duplicates: b.duplicateCount,
          committed: b.committedCount,
          createdAt: b.createdAt.toISOString(),
        })),
      })),
  );

  server.registerTool(
    "kasvo_get_import",
    {
      title: "Review a staged import",
      description: "Rows of a staged import with suggested categories and duplicate flags, so they can be reviewed before kasvo_commit_import.",
      inputSchema: { importId: z.string(), limit: z.number().int().min(1).max(1000).optional().describe("Default 200") },
      annotations: READ,
    },
    ({ importId, limit }) =>
      run(async () => {
        const batch = await getImport(userId, importId);
        if (!batch) throw new DomainError("NOT_FOUND", "not_found", `Import ${importId} not found.`, "Call kasvo_list_imports.");
        return {
          id: batch.id,
          status: batch.status,
          account: batch.accountName,
          rowCount: batch.rowCount,
          duplicateCount: batch.duplicateCount,
          uncategorized: batch.rows.filter((r) => !r.categoryId && !r.duplicate).length,
          rows: batch.rows.slice(0, limit ?? 200).map((r) => ({
            rowId: r.id,
            date: day(r.bookedOn),
            amount: money(ctx, r.amount),
            description: r.description,
            payee: r.payee,
            category: r.categoryName,
            duplicate: r.duplicate,
          })),
        };
      }),
  );

  server.registerTool(
    "kasvo_list_rules",
    { title: "List rules", description: "Categorization rules in the order they are tried. The first matching rule wins.", annotations: READ },
    () =>
      run(async () => ({
        rules: (await listRules(userId)).map((r) => ({
          id: r.id,
          contains: r.contains,
          category: r.categoryName,
          kind: r.kind,
          account: r.accountName,
          minAmount: r.minAmount === null ? null : money(ctx, r.minAmount),
          maxAmount: r.maxAmount === null ? null : money(ctx, r.maxAmount),
          setPayee: r.setPayee,
          priority: r.priority,
          enabled: r.enabled,
        })),
      })),
  );

  if (!ctx.scopes.includes("write")) return;

  server.registerTool(
    "kasvo_stage_import",
    {
      title: "Stage a statement import",
      description:
        "Stages transactions for one account without touching the ledger. Pass exactly one of: `csv` (raw text of a bank or e-wallet CSV export: BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, or any CSV with recognisable headers); `pdfBase64` (a text-based statement PDF, up to 3 MB; add `password` for a locked e-statement, which is used once and never stored); or `rows` you extracted yourself, e.g. from a scanned PDF (signed amounts: negative is money out). Rules suggest categories and rows already in the account are flagged as duplicates. Review with kasvo_get_import, then kasvo_commit_import.",
      inputSchema: {
        account: z.string().describe("Account id or name"),
        csv: z.string().optional(),
        pdfBase64: z.string().max(4_500_000).optional().describe("Base64 of a statement PDF"),
        password: z.string().max(200).optional().describe("PDF password, only for a locked PDF"),
        fileName: z.string().optional(),
        rows: z
          .array(z.object({ date: z.string().describe("YYYY-MM-DD"), amount: z.union([z.number(), z.string()]), description: z.string(), payee: z.string().optional() }))
          .optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const accountId = await resolveAccount(ctx, a.account);
        if ([a.csv, a.pdfBase64, a.rows].filter(Boolean).length > 1) throw new DomainError("INVALID", "no_rows", "Pass only one of csv, pdfBase64, or rows.");
        if (a.pdfBase64) {
          const bytes = new Uint8Array(Buffer.from(a.pdfBase64, "base64"));
          const r = await stagePdf(ctx.actor, { accountId, fileName: a.fileName, bytes, password: a.password });
          const check = r.unsigned ? ` ${r.unsigned} row(s) had no debit/credit marker and were read as money out: check them with the user.` : "";
          return { ...r, next: `Review with kasvo_get_import, then call kasvo_commit_import.${check}` };
        }
        if (a.csv) {
          const r = await stageFile(ctx.actor, { accountId, fileName: a.fileName, text: a.csv });
          if (r.status === "NEEDS_MAPPING") {
            return { ...r, next: "The CSV headers were not recognised. Read the preview, extract the rows yourself, and call kasvo_stage_import again with `rows`." };
          }
          return { ...r, next: "Review with kasvo_get_import, then call kasvo_commit_import." };
        }
        if (a.rows?.length) return { ...(await stageRows(ctx.actor, { accountId, label: a.fileName, rows: a.rows })), next: "Review with kasvo_get_import, then call kasvo_commit_import." };
        throw new DomainError("INVALID", "no_rows", "Nothing to stage.", "Pass `csv`, `pdfBase64`, or a non-empty `rows` array.");
      }),
  );

  server.registerTool(
    "kasvo_commit_import",
    {
      title: "Commit a staged import",
      description:
        "Writes a staged import into the ledger. Duplicates are skipped unless includeDuplicates is true. `changes` adjusts individual rows by rowId from kasvo_get_import: set a category by name or id, null to clear it, or skip the row.",
      inputSchema: {
        importId: z.string(),
        includeDuplicates: z.boolean().optional(),
        changes: z.array(z.object({ rowId: z.string(), category: z.string().nullable().optional(), skip: z.boolean().optional() })).optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const batch = await getImport(userId, a.importId);
        if (!batch) throw new DomainError("NOT_FOUND", "not_found", `Import ${a.importId} not found.`);
        const overrides: Record<string, { categoryId?: string | null; skip?: boolean }> = {};
        for (const c of a.changes ?? []) {
          const row = batch.rows.find((r) => r.id === c.rowId);
          if (!row) throw new DomainError("NOT_FOUND", "not_found", `Row ${c.rowId} is not in this import.`);
          const kind = row.amount < 0n ? "EXPENSE" : "INCOME";
          overrides[c.rowId] = {
            skip: c.skip,
            categoryId: c.category === null ? null : c.category ? await resolveCategory(ctx, c.category, kind) : undefined,
          };
        }
        return commitImport(ctx.actor, a.importId, { overrides, includeDuplicates: a.includeDuplicates });
      }),
  );

  server.registerTool(
    "kasvo_discard_import",
    { title: "Discard a staged import", description: "Throws away a staged import that was never committed. The ledger is not touched.", inputSchema: { importId: z.string() }, annotations: WRITE },
    ({ importId }) => run(async () => (await discardImport(ctx.actor, importId), { discarded: importId })),
  );

  server.registerTool(
    "kasvo_create_rule",
    {
      title: "Create a categorization rule",
      description:
        "When a transaction's description or payee contains `contains`, give it `category`. It only fires on transactions of the category's kind. Returns how many existing uncategorized transactions it would match; pass apply=true to categorize them now.",
      inputSchema: {
        contains: z.string().describe("Text to look for, case-insensitive, e.g. 'indomaret'"),
        category: z.string().describe("Category id or name"),
        kind: z.enum(["EXPENSE", "INCOME"]).optional().describe("Which kind the category name refers to; default EXPENSE"),
        account: z.string().optional().describe("Only for this account"),
        minAmount: z.union([z.number(), z.string()]).optional(),
        maxAmount: z.union([z.number(), z.string()]).optional(),
        setPayee: z.string().optional(),
        priority: z.number().int().min(0).max(10_000).optional().describe("Lower runs first; default 100"),
        apply: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const r = await createRule(ctx.actor, {
          contains: a.contains,
          categoryId: await resolveCategory(ctx, a.category, a.kind ?? "EXPENSE"),
          accountId: a.account ? await resolveAccount(ctx, a.account) : undefined,
          minAmount: a.minAmount,
          maxAmount: a.maxAmount,
          setPayee: a.setPayee,
          priority: a.priority,
        });
        return { ...r, applied: a.apply ? await applyRules(ctx.actor, r.id) : 0 };
      }),
  );

  server.registerTool(
    "kasvo_apply_rules",
    { title: "Apply rules", description: "Runs all enabled rules over every uncategorized transaction and reports how many were categorized.", annotations: { ...WRITE, idempotentHint: true } },
    () => run(async () => ({ categorized: await applyRules(ctx.actor) })),
  );
}
