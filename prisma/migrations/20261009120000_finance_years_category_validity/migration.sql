-- Finance: Gültigkeit von Kategorien pro Jahr und explizit angelegte Budgetjahre
ALTER TABLE "finance_category" ADD COLUMN IF NOT EXISTS "validFrom" INTEGER;
ALTER TABLE "finance_category" ADD COLUMN IF NOT EXISTS "validUntil" INTEGER;

CREATE TABLE IF NOT EXISTS "finance_year" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_year_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "finance_year_organizationId_year_key" ON "finance_year"("organizationId", "year");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_year_organizationId_fkey') THEN
    ALTER TABLE "finance_year" ADD CONSTRAINT "finance_year_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
