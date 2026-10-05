-- DAM Gesichtserkennung: Personen, erkannte Gesichter, Feld «Personen», Scan-Status pro Asset
-- Idempotent und rein additiv. Bestand bekommt faceStatus = pending; der Scheduler läuft
-- erst, wenn FACE_RECOGNITION_ENABLED=true gesetzt ist.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FaceScanStatus') THEN
    CREATE TYPE "FaceScanStatus" AS ENUM ('pending', 'processing', 'done', 'failed', 'skipped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FaceMatchStatus') THEN
    CREATE TYPE "FaceMatchStatus" AS ENUM ('unassigned', 'suggested', 'confirmed', 'rejected', 'ignored');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssetPersonSource') THEN
    CREATE TYPE "AssetPersonSource" AS ENUM ('face', 'manual');
  END IF;
END $$;

ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "faceStatus" "FaceScanStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "faceScannedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "asset_faceStatus_idx" ON "asset"("faceStatus");

CREATE TABLE IF NOT EXISTS "dam_person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rekognitionUserId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dam_person_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "dam_person_name_key" ON "dam_person"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "dam_person_rekognitionUserId_key" ON "dam_person"("rekognitionUserId");

CREATE TABLE IF NOT EXISTS "asset_face" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "rekognitionFaceId" TEXT,
    "box" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sharpness" DOUBLE PRECISION,
    "status" "FaceMatchStatus" NOT NULL DEFAULT 'unassigned',
    "personId" TEXT,
    "similarity" DOUBLE PRECISION,
    "assignedBy" TEXT,
    "associated" BOOLEAN NOT NULL DEFAULT false,
    "rejectedPersonIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_face_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "asset_face_rekognitionFaceId_key" ON "asset_face"("rekognitionFaceId");
CREATE INDEX IF NOT EXISTS "asset_face_assetId_idx" ON "asset_face"("assetId");
CREATE INDEX IF NOT EXISTS "asset_face_personId_status_idx" ON "asset_face"("personId", "status");
CREATE INDEX IF NOT EXISTS "asset_face_status_idx" ON "asset_face"("status");

CREATE TABLE IF NOT EXISTS "asset_person" (
    "assetId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "source" "AssetPersonSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_person_pkey" PRIMARY KEY ("assetId", "personId")
);
CREATE INDEX IF NOT EXISTS "asset_person_personId_idx" ON "asset_person"("personId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dam_person_createdBy_fkey') THEN
    ALTER TABLE "dam_person" ADD CONSTRAINT "dam_person_createdBy_fkey"
      FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_face_assetId_fkey') THEN
    ALTER TABLE "asset_face" ADD CONSTRAINT "asset_face_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_face_personId_fkey') THEN
    ALTER TABLE "asset_face" ADD CONSTRAINT "asset_face_personId_fkey"
      FOREIGN KEY ("personId") REFERENCES "dam_person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_person_assetId_fkey') THEN
    ALTER TABLE "asset_person" ADD CONSTRAINT "asset_person_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_person_personId_fkey') THEN
    ALTER TABLE "asset_person" ADD CONSTRAINT "asset_person_personId_fkey"
      FOREIGN KEY ("personId") REFERENCES "dam_person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
