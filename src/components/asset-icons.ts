import { Building2, Car, Coins, Gem, Landmark, LineChart, PiggyBank, ShieldCheck, TrendingUp, type LucideIcon } from "lucide-react";
import type { AssetKind } from "@/generated/prisma/client";

export const ASSET_ICONS: Record<AssetKind, LucideIcon> = {
  PROPERTY: Building2,
  VEHICLE: Car,
  GOLD: Coins,
  STOCK: LineChart,
  FUND: TrendingUp,
  CRYPTO: Gem,
  DEPOSIT: Landmark,
  PENSION: ShieldCheck,
  OTHER: PiggyBank,
};
