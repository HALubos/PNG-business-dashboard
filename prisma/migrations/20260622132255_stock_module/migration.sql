-- CreateTable
CREATE TABLE "ImportSnapshot" (
    "id" TEXT NOT NULL,
    "nazevSouboru" TEXT NOT NULL,
    "datumExportu" TIMESTAMP(3) NOT NULL,
    "nahranoKdy" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nahralUserId" TEXT,
    "pocetProduktu" INTEGER NOT NULL DEFAULT 0,
    "pocetOdberatelu" INTEGER NOT NULL DEFAULT 0,
    "pocetRadku" INTEGER NOT NULL DEFAULT 0,
    "varovani" JSONB,
    "aktivni" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ImportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "code" TEXT,
    "producer" TEXT,
    "nazev" TEXT NOT NULL,
    "size" TEXT,
    "kategorie" TEXT,
    "kategorieBreadcrumb" TEXT,
    "ourStock" INTEGER NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(12,2),
    "price" DECIMAL(12,2),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerProductAvailability" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "stock" INTEGER,
    "availability" TEXT,
    "cena" DECIMAL(12,2),

    CONSTRAINT "ResellerProductAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "availableStates" TEXT[] DEFAULT ARRAY['skladem', 'do 3 dnů']::TEXT[],
    "stockThreshold" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportSnapshot_aktivni_idx" ON "ImportSnapshot"("aktivni");

-- CreateIndex
CREATE INDEX "ImportSnapshot_nahranoKdy_idx" ON "ImportSnapshot"("nahranoKdy");

-- CreateIndex
CREATE INDEX "Product_snapshotId_producer_idx" ON "Product"("snapshotId", "producer");

-- CreateIndex
CREATE UNIQUE INDEX "Product_snapshotId_ean_key" ON "Product"("snapshotId", "ean");

-- CreateIndex
CREATE INDEX "ResellerProductAvailability_snapshotId_resellerId_idx" ON "ResellerProductAvailability"("snapshotId", "resellerId");

-- CreateIndex
CREATE INDEX "ResellerProductAvailability_productId_idx" ON "ResellerProductAvailability"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerProductAvailability_snapshotId_productId_resellerId_key" ON "ResellerProductAvailability"("snapshotId", "productId", "resellerId");

-- AddForeignKey
ALTER TABLE "ImportSnapshot" ADD CONSTRAINT "ImportSnapshot_nahralUserId_fkey" FOREIGN KEY ("nahralUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ImportSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerProductAvailability" ADD CONSTRAINT "ResellerProductAvailability_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ImportSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerProductAvailability" ADD CONSTRAINT "ResellerProductAvailability_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerProductAvailability" ADD CONSTRAINT "ResellerProductAvailability_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
