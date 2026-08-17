-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('staging', 'published', 'rejected', 'archived');

-- CreateEnum
CREATE TYPE "RightsType" AS ENUM ('own', 'provided', 'free_use');

-- CreateTable
CREATE TABLE "upload_batch" (
    "id" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "credit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'staging',
    "rating" INTEGER,
    "credit" TEXT NOT NULL,
    "rightsType" "RightsType" NOT NULL,
    "altText" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exif" JSONB,
    "takenAt" TIMESTAMP(3),
    "width" INTEGER,
    "height" INTEGER,
    "editParams" JSONB,
    "uploadedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "isPersonal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_collection" (
    "assetId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,

    CONSTRAINT "asset_collection_pkey" PRIMARY KEY ("assetId","collectionId")
);

-- CreateTable
CREATE TABLE "export_log" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "exportedBy" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetUrl" TEXT,

    CONSTRAINT "export_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_batch_uploadedBy_idx" ON "upload_batch"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "asset_r2Key_key" ON "asset"("r2Key");

-- CreateIndex
CREATE INDEX "asset_status_idx" ON "asset"("status");

-- CreateIndex
CREATE INDEX "asset_uploadedBy_idx" ON "asset"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "asset_batchId_sequence_key" ON "asset"("batchId", "sequence");

-- CreateIndex
CREATE INDEX "collection_createdBy_idx" ON "collection"("createdBy");

-- CreateIndex
CREATE INDEX "asset_collection_collectionId_idx" ON "asset_collection"("collectionId");

-- CreateIndex
CREATE INDEX "export_log_assetId_idx" ON "export_log"("assetId");

-- CreateIndex
CREATE INDEX "export_log_exportedBy_idx" ON "export_log"("exportedBy");

-- AddForeignKey
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "upload_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection" ADD CONSTRAINT "collection_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_collection" ADD CONSTRAINT "asset_collection_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_collection" ADD CONSTRAINT "asset_collection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_log" ADD CONSTRAINT "export_log_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_log" ADD CONSTRAINT "export_log_exportedBy_fkey" FOREIGN KEY ("exportedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
