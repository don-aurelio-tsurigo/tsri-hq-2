-- Payrexx payout bookkeeping (org-scoped)

CREATE TABLE IF NOT EXISTS "payrexx_payout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CHF',
    "status" TEXT NOT NULL,
    "statement" TEXT,
    "payoutFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unmappedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrexx_payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payrexx_payout_line" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "transactionId" TEXT,
    "date" TEXT,
    "time" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "fees" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT,
    "description" TEXT,
    "channel" TEXT,
    "paymentMethod" TEXT,
    "customer" TEXT,
    "externalReference" TEXT,
    "instance" TEXT,
    "categoryKey" TEXT,
    "categorySource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payrexx_payout_line_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payrexx_channel_rule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrexx_channel_rule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payrexx_payout_organizationId_uuid_key"
  ON "payrexx_payout"("organizationId", "uuid");

CREATE INDEX IF NOT EXISTS "payrexx_payout_organizationId_date_idx"
  ON "payrexx_payout"("organizationId", "date");

CREATE INDEX IF NOT EXISTS "payrexx_payout_line_payoutId_categoryKey_idx"
  ON "payrexx_payout_line"("payoutId", "categoryKey");

CREATE INDEX IF NOT EXISTS "payrexx_payout_line_payoutId_channel_idx"
  ON "payrexx_payout_line"("payoutId", "channel");

CREATE UNIQUE INDEX IF NOT EXISTS "payrexx_channel_rule_organizationId_channel_key"
  ON "payrexx_channel_rule"("organizationId", "channel");

DO $$ BEGIN
  ALTER TABLE "payrexx_payout"
    ADD CONSTRAINT "payrexx_payout_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payrexx_payout_line"
    ADD CONSTRAINT "payrexx_payout_line_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "payrexx_payout"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payrexx_channel_rule"
    ADD CONSTRAINT "payrexx_channel_rule_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
