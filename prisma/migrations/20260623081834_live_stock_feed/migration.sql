-- AlterTable
ALTER TABLE "StockConfig" ADD COLUMN     "feedItems" INTEGER,
ADD COLUMN     "feedRefreshedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OurStockItem" (
    "ean" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stock7d" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OurStockItem_pkey" PRIMARY KEY ("ean")
);
