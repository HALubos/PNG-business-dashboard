-- AlterTable
ALTER TABLE "Reseller" ADD COLUMN     "feedConfig" JSONB,
ADD COLUMN     "feedFormat" TEXT,
ADD COLUMN     "feedItems" INTEGER,
ADD COLUMN     "feedRefreshedAt" TIMESTAMP(3),
ADD COLUMN     "feedUrl" TEXT;

-- CreateTable
CREATE TABLE "ResellerFeedItem" (
    "resellerId" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "stock" INTEGER,
    "availability" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerFeedItem_pkey" PRIMARY KEY ("resellerId","ean")
);

-- AddForeignKey
ALTER TABLE "ResellerFeedItem" ADD CONSTRAINT "ResellerFeedItem_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
