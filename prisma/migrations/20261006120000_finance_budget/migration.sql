-- Finance: Kategorien, Budget/Forecast pro Monat, Buchungen, Deals, Monatsabschluss
-- Rein additiv. Effektiv wird zur Laufzeit aus finance_booking summiert.

-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "FinanceDealStatus" AS ENUM ('open', 'split', 'ignored');

-- CreateTable
CREATE TABLE "finance_category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "group" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "liquidityOnly" BOOLEAN NOT NULL DEFAULT false,
    "airtableId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_budget_entry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "forecast" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_budget_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_deal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "organisation" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "responsibleName" TEXT,
    "bexioUrl" TEXT,
    "status" "FinanceDealStatus" NOT NULL DEFAULT 'open',
    "changedAfterSplit" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_booking" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "organisation" TEXT,
    "responsibleName" TEXT,
    "bexioUrl" TEXT,
    "notes" TEXT,
    "dealId" TEXT,
    "airtableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_month_close" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_month_close_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_category_organizationId_sortOrder_idx" ON "finance_category"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "finance_category_organizationId_name_key" ON "finance_category"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "finance_category_organizationId_airtableId_key" ON "finance_category"("organizationId", "airtableId");

-- CreateIndex
CREATE INDEX "finance_budget_entry_organizationId_month_idx" ON "finance_budget_entry"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "finance_budget_entry_categoryId_month_key" ON "finance_budget_entry"("categoryId", "month");

-- CreateIndex
CREATE INDEX "finance_deal_organizationId_status_idx" ON "finance_deal"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_deal_organizationId_source_externalId_key" ON "finance_deal"("organizationId", "source", "externalId");

-- CreateIndex
CREATE INDEX "finance_booking_organizationId_month_categoryId_idx" ON "finance_booking"("organizationId", "month", "categoryId");

-- CreateIndex
CREATE INDEX "finance_booking_dealId_idx" ON "finance_booking"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_booking_organizationId_airtableId_key" ON "finance_booking"("organizationId", "airtableId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_month_close_organizationId_month_key" ON "finance_month_close"("organizationId", "month");

-- AddForeignKey
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget_entry" ADD CONSTRAINT "finance_budget_entry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget_entry" ADD CONSTRAINT "finance_budget_entry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_deal" ADD CONSTRAINT "finance_deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_booking" ADD CONSTRAINT "finance_booking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_booking" ADD CONSTRAINT "finance_booking_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_booking" ADD CONSTRAINT "finance_booking_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "finance_deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_month_close" ADD CONSTRAINT "finance_month_close_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
