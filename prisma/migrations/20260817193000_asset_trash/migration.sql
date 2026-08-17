-- Soft-delete metadata for published assets in the trash.
ALTER TABLE "asset" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "asset" ADD COLUMN "deletedBy" TEXT;

CREATE INDEX "asset_deletedAt_idx" ON "asset"("deletedAt");
CREATE INDEX "asset_status_deletedAt_idx" ON "asset"("status", "deletedAt");

ALTER TABLE "asset" ADD CONSTRAINT "asset_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep export history after the asset row is gone.
ALTER TABLE "export_log" DROP CONSTRAINT "export_log_assetId_fkey";
ALTER TABLE "export_log" ALTER COLUMN "assetId" DROP NOT NULL;
ALTER TABLE "export_log" ADD CONSTRAINT "export_log_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
