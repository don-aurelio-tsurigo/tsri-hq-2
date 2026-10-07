-- Finance: Organisationen (Kund:innen/Firmen) als Liste statt Freitext.
-- Legt aus den bisherigen Freitexten Einträge an, verknüpft Deals und Buchungen
-- und entfernt danach die Textspalten.

CREATE TABLE "finance_company" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "pipedriveId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_company_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "finance_company_organizationId_nameKey_key" ON "finance_company"("organizationId", "nameKey");
CREATE UNIQUE INDEX "finance_company_organizationId_pipedriveId_key" ON "finance_company"("organizationId", "pipedriveId");
ALTER TABLE "finance_company" ADD CONSTRAINT "finance_company_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance_deal" ADD COLUMN "companyId" TEXT;
ALTER TABLE "finance_booking" ADD COLUMN "companyId" TEXT;

-- Bestehende Freitexte übernehmen (Leerraum zusammengefasst, Schreibweise der ersten Variante)
WITH names AS (
  SELECT "organizationId", regexp_replace(btrim("organisation"), '\s+', ' ', 'g') AS name
  FROM "finance_deal" WHERE "organisation" IS NOT NULL AND btrim("organisation") <> ''
  UNION ALL
  SELECT "organizationId", regexp_replace(btrim("organisation"), '\s+', ' ', 'g') AS name
  FROM "finance_booking" WHERE "organisation" IS NOT NULL AND btrim("organisation") <> ''
), keyed AS (
  SELECT "organizationId", lower(name) AS "nameKey", min(name) AS name
  FROM names GROUP BY "organizationId", lower(name)
)
INSERT INTO "finance_company" ("id", "organizationId", "name", "nameKey", "createdAt", "updatedAt")
SELECT 'c' || md5(random()::text || clock_timestamp()::text || "nameKey"), "organizationId", name, "nameKey",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM keyed;

UPDATE "finance_deal" d SET "companyId" = c."id"
FROM "finance_company" c
WHERE c."organizationId" = d."organizationId"
  AND c."nameKey" = lower(regexp_replace(btrim(d."organisation"), '\s+', ' ', 'g'));

UPDATE "finance_booking" b SET "companyId" = c."id"
FROM "finance_company" c
WHERE c."organizationId" = b."organizationId"
  AND c."nameKey" = lower(regexp_replace(btrim(b."organisation"), '\s+', ' ', 'g'));

ALTER TABLE "finance_deal" DROP COLUMN "organisation";
ALTER TABLE "finance_booking" DROP COLUMN "organisation";

CREATE INDEX "finance_deal_companyId_idx" ON "finance_deal"("companyId");
CREATE INDEX "finance_booking_companyId_idx" ON "finance_booking"("companyId");
ALTER TABLE "finance_deal" ADD CONSTRAINT "finance_deal_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "finance_company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_booking" ADD CONSTRAINT "finance_booking_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "finance_company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
