-- CreateTable
CREATE TABLE "ProductMetricFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" "ConnectorType" NOT NULL,
    "date" DATE NOT NULL,
    "itemId" TEXT NOT NULL,
    "categoryId" INTEGER,
    "name" TEXT,
    "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orders" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProductMetricFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductMetricFact_projectId_date_idx" ON "ProductMetricFact"("projectId", "date");

-- CreateIndex
CREATE INDEX "ProductMetricFact_projectId_source_itemId_idx" ON "ProductMetricFact"("projectId", "source", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMetricFact_projectId_source_date_itemId_key" ON "ProductMetricFact"("projectId", "source", "date", "itemId");

-- AddForeignKey
ALTER TABLE "ProductMetricFact" ADD CONSTRAINT "ProductMetricFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
