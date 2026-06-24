-- CreateEnum
CREATE TYPE "ConnectorKind" AS ENUM ('url_feed', 'oauth_api');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('shoptet_orders', 'meta_ads', 'google_ads', 'sklik', 'ga4');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('idle', 'processing', 'ok', 'error');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "klic" TEXT NOT NULL,
    "nazev" TEXT NOT NULL,
    "web" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ConnectorKind" NOT NULL,
    "type" "ConnectorType" NOT NULL,
    "nazev" TEXT NOT NULL,
    "feedUrl" TEXT,
    "credentialsEnc" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'idle',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "cursor" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" "ConnectorType" NOT NULL,
    "date" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MetricFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_klic_key" ON "Project"("klic");

-- CreateIndex
CREATE INDEX "Connector_projectId_idx" ON "Connector"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Connector_projectId_type_key" ON "Connector"("projectId", "type");

-- CreateIndex
CREATE INDEX "MetricFact_projectId_date_idx" ON "MetricFact"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetricFact_projectId_source_date_metric_key" ON "MetricFact"("projectId", "source", "date", "metric");

-- AddForeignKey
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricFact" ADD CONSTRAINT "MetricFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
