-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('STAGED', 'NEEDS_MAPPING', 'COMMITTED', 'REVERTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "importBatchId" TEXT;

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fileName" TEXT,
    "fileHash" TEXT,
    "rawContent" TEXT,
    "mapping" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'STAGED',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "committedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staged_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "bookedOn" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "payee" TEXT,
    "fingerprint" TEXT NOT NULL,
    "duplicate" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,
    "ruleId" TEXT,
    "skip" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "staged_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "contains" TEXT NOT NULL,
    "kind" "CategoryKind",
    "accountId" TEXT,
    "minAmount" BIGINT,
    "maxAmount" BIGINT,
    "categoryId" TEXT NOT NULL,
    "setPayee" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_userId_createdAt_idx" ON "import_batches"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "import_batches_accountId_fileHash_idx" ON "import_batches"("accountId", "fileHash");

-- CreateIndex
CREATE INDEX "staged_rows_batchId_line_idx" ON "staged_rows"("batchId", "line");

-- CreateIndex
CREATE INDEX "rules_userId_priority_idx" ON "rules"("userId", "priority");

-- CreateIndex
CREATE INDEX "transactions_importBatchId_idx" ON "transactions"("importBatchId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staged_rows" ADD CONSTRAINT "staged_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staged_rows" ADD CONSTRAINT "staged_rows_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
