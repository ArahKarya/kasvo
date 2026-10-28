-- CreateEnum
CREATE TYPE "Necessity" AS ENUM ('NEED', 'WANT');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('PROPERTY', 'VEHICLE', 'GOLD', 'STOCK', 'FUND', 'CRYPTO', 'DEPOSIT', 'OTHER');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "icon" TEXT,
ADD COLUMN     "necessity" "Necessity";

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "necessity" "Necessity";

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "units" DECIMAL(24,8),
    "purchaseValue" BIGINT,
    "purchasedOn" DATE,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_valuations" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "valuedOn" DATE NOT NULL,
    "value" BIGINT NOT NULL,
    "unitPrice" BIGINT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_userId_name_key" ON "assets"("userId", "name");

-- CreateIndex
CREATE INDEX "asset_valuations_assetId_valuedOn_idx" ON "asset_valuations"("assetId", "valuedOn");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Style existing categories that still carry their seeded name (in either language).
UPDATE "categories" SET "icon" = 'briefcase', "color" = COALESCE("color", 'green'), "necessity" = NULL::"Necessity" WHERE "kind" = 'INCOME' AND "name" IN ('Gaji', 'Salary') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'gift', "color" = COALESCE("color", 'amber'), "necessity" = NULL::"Necessity" WHERE "kind" = 'INCOME' AND "name" IN ('Bonus & THR', 'Bonus & holiday allowance') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'store', "color" = COALESCE("color", 'teal'), "necessity" = NULL::"Necessity" WHERE "kind" = 'INCOME' AND "name" IN ('Usaha', 'Business') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'trending-up', "color" = COALESCE("color", 'blue'), "necessity" = NULL::"Necessity" WHERE "kind" = 'INCOME' AND "name" IN ('Investasi', 'Investment') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'wallet', "color" = COALESCE("color", 'slate'), "necessity" = NULL::"Necessity" WHERE "kind" = 'INCOME' AND "name" IN ('Lain-lain', 'Other') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'utensils', "color" = COALESCE("color", 'orange'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Makan & minum', 'Food & drink') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'shopping-cart', "color" = COALESCE("color", 'green'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Belanja harian', 'Groceries') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'car', "color" = COALESCE("color", 'blue'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Transportasi', 'Transport') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'zap', "color" = COALESCE("color", 'amber'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Tagihan & utilitas', 'Bills & utilities') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'smartphone', "color" = COALESCE("color", 'teal'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Pulsa & internet', 'Phone & internet') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'home', "color" = COALESCE("color", 'purple'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Rumah', 'Housing') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'heart-pulse', "color" = COALESCE("color", 'red'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Kesehatan', 'Health') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'graduation-cap', "color" = COALESCE("color", 'blue'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Pendidikan', 'Education') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'film', "color" = COALESCE("color", 'pink'), "necessity" = 'WANT'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Hiburan', 'Entertainment') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'shopping-bag', "color" = COALESCE("color", 'purple'), "necessity" = 'WANT'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Belanja', 'Shopping') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'hand-heart', "color" = COALESCE("color", 'green'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Zakat & sedekah', 'Charity') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'users', "color" = COALESCE("color", 'pink'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Keluarga', 'Family') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'landmark', "color" = COALESCE("color", 'slate'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Cicilan', 'Loan repayment') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'receipt', "color" = COALESCE("color", 'slate'), "necessity" = 'NEED'::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Biaya admin bank', 'Bank fees') AND "icon" IS NULL;
UPDATE "categories" SET "icon" = 'tag', "color" = COALESCE("color", 'slate'), "necessity" = NULL::"Necessity" WHERE "kind" = 'EXPENSE' AND "name" IN ('Lain-lain', 'Other') AND "icon" IS NULL;
