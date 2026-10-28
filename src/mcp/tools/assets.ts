import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/server/db";
import { ASSET_KINDS, createAsset, getAsset, listAssets, valueAsset, type AssetView } from "@/server/domain/assets";
import { DomainError } from "@/server/domain/errors";
import type { McpContext } from "../context";
import { money, run } from "../result";
import { today } from "../resolve";

const amount = z.union([z.number(), z.string()]);

function assetOut(ctx: McpContext, a: AssetView) {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    units: a.units,
    value: money(ctx, a.value),
    valuedOn: a.valuedOn ?? "purchase value (never valued)",
    unitPrice: a.unitPrice === null ? null : money(ctx, a.unitPrice),
    purchaseValue: a.purchaseValue === null ? null : money(ctx, a.purchaseValue),
    gain: a.gain === null ? null : money(ctx, a.gain),
    archived: a.archived,
  };
}

async function resolveAsset(ctx: McpContext, ref: string): Promise<string> {
  const row = await db.asset.findFirst({ where: { userId: ctx.actor.userId, OR: [{ id: ref }, { name: { equals: ref, mode: "insensitive" } }] }, select: { id: true } });
  if (row) return row.id;
  throw new DomainError("NOT_FOUND", "not_found", `No asset matches "${ref}".`, "Call kasvo_list_assets for names and ids.");
}

export function registerAssetTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "kasvo_list_assets",
    {
      title: "List assets",
      description: "Assets outside the accounts (property, vehicles, gold, stocks, funds, crypto, deposits) with their latest value, units, purchase value, and gain. They count toward net worth in kasvo_overview.",
      inputSchema: { includeArchived: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ includeArchived }) =>
      run(async () => {
        const rows = await listAssets(ctx.actor.userId, { includeArchived });
        return { total: money(ctx, rows.filter((r) => !r.archived).reduce((s, r) => s + r.value, 0n)), assets: rows.map((a) => assetOut(ctx, a)) };
      }),
  );

  if (!ctx.scopes.includes("write")) return;

  server.registerTool(
    "kasvo_create_asset",
    {
      title: "Create an asset",
      description: "Records an asset. Give `units` for things priced per unit (grams of gold, shares, fund units, coins) so later valuations can use a unit price.",
      inputSchema: {
        name: z.string(),
        kind: z.enum(ASSET_KINDS),
        units: z.union([z.number(), z.string()]).optional(),
        purchaseValue: amount.optional().describe('Total paid, e.g. "15jt"'),
        purchasedOn: z.string().optional().describe("YYYY-MM-DD"),
        currentValue: amount.optional().describe("Today's total value; defaults to the purchase value"),
        note: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (a) =>
      run(async () => {
        const { id } = await createAsset(ctx.actor, a, today(ctx));
        return assetOut(ctx, await getAsset(ctx.actor.userId, id));
      }),
  );

  server.registerTool(
    "kasvo_value_asset",
    {
      title: "Update an asset's value",
      description: "Records what an asset is worth on a day: the total `value`, or `unitPrice` for a unit-based asset (multiplied by its units). History is kept.",
      inputSchema: { asset: z.string().describe("Asset id or name"), value: amount.optional(), unitPrice: amount.optional(), date: z.string().optional().describe("YYYY-MM-DD; defaults to today"), note: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (a) =>
      run(async () => {
        const assetId = await resolveAsset(ctx, a.asset);
        await valueAsset(ctx.actor, { assetId, valuedOn: a.date ?? today(ctx), value: a.value, unitPrice: a.unitPrice, note: a.note });
        return assetOut(ctx, await getAsset(ctx.actor.userId, assetId));
      }),
  );
}
