import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import { Prisma, type AssetKind } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { DomainError, notFound } from "./errors";
import { toDay } from "./dates";
import { daySchema, optionalDaySchema, optionalText, positiveAmountSchema } from "./schemas";

type Tx = Prisma.TransactionClient;

export const ASSET_KINDS = ["PROPERTY", "VEHICLE", "GOLD", "STOCK", "FUND", "CRYPTO", "DEPOSIT", "PENSION", "OTHER"] as const satisfies readonly AssetKind[];

/** "12,5" or 12.5 → a positive decimal string; empty means "not unit-based". */
const unitsSchema = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const text = String(value).trim().replace(/\s/g, "").replace(",", ".");
    if (text === "") return undefined;
    if (!/^\d+(\.\d{1,8})?$/.test(text) || Number(text) <= 0) {
      ctx.addIssue({ code: "custom", message: `Not a quantity: ${String(value)}. Use a positive number such as 2.5.` });
      return z.NEVER;
    }
    return text;
  })
  .optional();

const optionalAmount = z.union([z.literal("").transform(() => undefined), positiveAmountSchema]).optional();

export const createAssetSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(ASSET_KINDS),
  units: unitsSchema,
  purchaseValue: optionalAmount,
  purchasedOn: optionalDaySchema,
  /** Today's value, recorded as the first valuation; defaults to the purchase value. */
  currentValue: optionalAmount,
  note: optionalText(500),
});

export const updateAssetSchema = createAssetSchema.omit({ currentValue: true }).partial();

export const valueAssetSchema = z
  .object({
    assetId: z.string().min(1),
    valuedOn: daySchema,
    /** Total value; or give `unitPrice` for a unit-based asset and it is multiplied out. */
    value: optionalAmount,
    unitPrice: optionalAmount,
    note: optionalText(200),
  })
  .refine((v) => v.value !== undefined || v.unitPrice !== undefined, { message: "Give the value or the price per unit.", path: ["value"] });

export interface AssetView {
  id: string;
  name: string;
  kind: AssetKind;
  units: string | null;
  purchaseValue: bigint | null;
  purchasedOn: string | null;
  note: string | null;
  archived: boolean;
  value: bigint;
  /** Day of the latest valuation, or null when the value is still the purchase value. */
  valuedOn: string | null;
  unitPrice: bigint | null;
  /** value − purchaseValue, when the purchase value is known. */
  gain: bigint | null;
}

export interface AssetDetail extends AssetView {
  valuations: { id: string; valuedOn: string; value: bigint; unitPrice: bigint | null; note: string | null }[];
}

/** Whole rupiah of units × price, rounded half up. */
export function multiply(units: string, unitPrice: bigint): bigint {
  const [whole, fraction = ""] = units.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const scaled = BigInt(whole + fraction) * unitPrice;
  return (scaled * 2n + scale) / (scale * 2n);
}

async function assertNameFree(tx: Tx, userId: string, name: string, exceptId?: string): Promise<void> {
  const clash = await tx.asset.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  if (clash) throw new DomainError("CONFLICT", "name_taken", `An asset named "${name}" already exists.`);
}

type AssetWithLatest = Prisma.AssetGetPayload<{ include: { valuations: true } }>;

function viewOf(a: AssetWithLatest): AssetView {
  const latest = a.valuations[0];
  const value = latest?.value ?? a.purchaseValue ?? 0n;
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    units: a.units?.toString() ?? null,
    purchaseValue: a.purchaseValue,
    purchasedOn: a.purchasedOn ? toDay(a.purchasedOn) : null,
    note: a.note,
    archived: a.archivedAt !== null,
    value,
    valuedOn: latest ? toDay(latest.valuedOn) : null,
    unitPrice: latest?.unitPrice ?? null,
    gain: a.purchaseValue === null ? null : value - a.purchaseValue,
  };
}

const latestValuation = { valuations: { orderBy: [{ valuedOn: "desc" as const }, { createdAt: "desc" as const }], take: 1 } };

export async function listAssets(userId: string, opts: { includeArchived?: boolean } = {}): Promise<AssetView[]> {
  const rows = await db.asset.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    include: latestValuation,
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { kind: "asc" }, { name: "asc" }],
  });
  return rows.map(viewOf).sort((a, b) => Number(b.value - a.value));
}

export async function getAsset(userId: string, id: string): Promise<AssetDetail> {
  const row = await db.asset.findFirst({ where: { id, userId }, include: { valuations: { orderBy: [{ valuedOn: "desc" }, { createdAt: "desc" }] } } });
  if (!row) throw notFound("Asset", id);
  return {
    ...viewOf(row),
    valuations: row.valuations.map((v) => ({ id: v.id, valuedOn: toDay(v.valuedOn), value: v.value, unitPrice: v.unitPrice, note: v.note })),
  };
}

export async function createAsset(actor: Actor, input: z.input<typeof createAssetSchema>, today: string): Promise<{ id: string }> {
  const data = createAssetSchema.parse(input);
  return db.$transaction(async (tx) => {
    await assertNameFree(tx, actor.userId, data.name);
    const { currentValue, units, ...rest } = data;
    const row = await tx.asset.create({ data: { ...rest, units: units ? new Prisma.Decimal(units) : null, userId: actor.userId } });
    if (currentValue !== undefined && currentValue !== data.purchaseValue) {
      await tx.assetValuation.create({ data: { assetId: row.id, userId: actor.userId, valuedOn: new Date(`${today}T00:00:00Z`), value: currentValue } });
    }
    await audit(tx, actor, { action: "asset.create", entity: "Asset", entityId: row.id, after: { ...row, currentValue } });
    return { id: row.id };
  });
}

export async function updateAsset(actor: Actor, id: string, input: z.input<typeof updateAssetSchema>): Promise<void> {
  const patch = updateAssetSchema.parse(input);
  await db.$transaction(async (tx) => {
    const before = await tx.asset.findFirst({ where: { id, userId: actor.userId } });
    if (!before) throw notFound("Asset", id);
    if (patch.name) await assertNameFree(tx, actor.userId, patch.name, id);
    const { units, ...rest } = patch;
    const after = await tx.asset.update({ where: { id }, data: { ...rest, ...(units !== undefined ? { units: new Prisma.Decimal(units) } : {}) } });
    await audit(tx, actor, { action: "asset.update", entity: "Asset", entityId: id, before, after });
  });
}

export async function setAssetArchived(actor: Actor, id: string, archived: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.asset.findFirst({ where: { id, userId: actor.userId } });
    if (!before) throw notFound("Asset", id);
    await tx.asset.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, actor, { action: archived ? "asset.archive" : "asset.unarchive", entity: "Asset", entityId: id });
  });
}

/** Records what the asset is worth on a day. A unit price is multiplied by the asset's units. */
export async function valueAsset(actor: Actor, input: z.input<typeof valueAssetSchema>): Promise<{ id: string; value: bigint }> {
  const data = valueAssetSchema.parse(input);
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.findFirst({ where: { id: data.assetId, userId: actor.userId } });
    if (!asset) throw notFound("Asset", data.assetId);
    let value = data.value;
    if (value === undefined) {
      if (!asset.units) throw new DomainError("INVALID", "asset_units", `"${asset.name}" has no units, so give its total value.`);
      value = multiply(asset.units.toString(), data.unitPrice!);
    }
    const row = await tx.assetValuation.create({
      data: { assetId: asset.id, userId: actor.userId, valuedOn: data.valuedOn, value, unitPrice: data.unitPrice, note: data.note },
    });
    await audit(tx, actor, { action: "asset.value", entity: "Asset", entityId: asset.id, after: row });
    return { id: row.id, value };
  });
}

export async function removeValuation(actor: Actor, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.assetValuation.findFirst({ where: { id, userId: actor.userId } });
    if (!before) throw notFound("Valuation", id);
    await tx.assetValuation.delete({ where: { id } });
    await audit(tx, actor, { action: "asset.valuation.remove", entity: "Asset", entityId: before.assetId, before });
  });
}
