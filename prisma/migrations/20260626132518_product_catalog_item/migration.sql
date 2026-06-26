-- CreateTable
CREATE TABLE "ProductCatalogItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ean" TEXT,
    "name" TEXT,
    "priceVat" DOUBLE PRECISION,
    "categoryText" TEXT,
    "internalCategory" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "deliveryDays" INTEGER,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCatalogItem_projectId_idx" ON "ProductCatalogItem"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCatalogItem_projectId_itemId_key" ON "ProductCatalogItem"("projectId", "itemId");

-- AddForeignKey
ALTER TABLE "ProductCatalogItem" ADD CONSTRAINT "ProductCatalogItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
