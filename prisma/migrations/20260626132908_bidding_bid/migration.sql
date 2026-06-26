-- CreateTable
CREATE TABLE "BiddingBid" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "cpc" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiddingBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BiddingBid_projectId_idx" ON "BiddingBid"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BiddingBid_projectId_itemId_key" ON "BiddingBid"("projectId", "itemId");

-- AddForeignKey
ALTER TABLE "BiddingBid" ADD CONSTRAINT "BiddingBid_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
