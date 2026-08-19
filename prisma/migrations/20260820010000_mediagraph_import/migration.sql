-- Mediagraph import fingerprint on assets and collections.
ALTER TABLE "asset" ADD COLUMN "mediagraphId" TEXT;
ALTER TABLE "asset" ADD COLUMN "importSource" TEXT;
CREATE UNIQUE INDEX "asset_mediagraphId_key" ON "asset"("mediagraphId");

ALTER TABLE "collection" ADD COLUMN "mediagraphId" TEXT;
CREATE UNIQUE INDEX "collection_mediagraphId_key" ON "collection"("mediagraphId");
