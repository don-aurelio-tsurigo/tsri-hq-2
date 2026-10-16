-- Finance: Provisionen (Modelle, Zuweisungen, Periodenabschluss, eingefrorene Abrechnungen)
-- und Provisionsfelder auf dem Deal. Neue Capability «sales» für Sales-Mitarbeitende.

-- CreateEnum
CREATE TYPE "FinanceCommissionStatus" AS ENUM ('undecided', 'relevant', 'not_relevant');

-- CreateEnum
CREATE TYPE "FinanceCommissionBasis" AS ENUM ('intern', 'total');

-- AlterEnum
ALTER TYPE "AppCapability" ADD VALUE 'sales';

-- AlterTable
ALTER TABLE "finance_deal" ADD COLUMN     "commissionExtern" DECIMAL(14,2),
ADD COLUMN     "commissionIntern" DECIMAL(14,2),
ADD COLUMN     "commissionStatus" "FinanceCommissionStatus" NOT NULL DEFAULT 'undecided',
ADD COLUMN     "salesUserId" TEXT,
ADD COLUMN     "soldAt" DATE;

-- CreateTable
CREATE TABLE "finance_commission_model" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "externRate" DECIMAL(6,4) NOT NULL,
    "internRateMin" DECIMAL(6,4) NOT NULL,
    "internRateMax" DECIMAL(6,4) NOT NULL,
    "threshold" DECIMAL(14,2) NOT NULL,
    "progressionBasis" "FinanceCommissionBasis" NOT NULL DEFAULT 'intern',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_commission_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_commission_assignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_commission_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_commission_period_close" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_commission_period_close_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_commission_statement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "internSum" DECIMAL(14,2) NOT NULL,
    "externSum" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dealCount" INTEGER NOT NULL,
    "modelSnapshot" JSONB,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_commission_statement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_commission_model_organizationId_name_key" ON "finance_commission_model"("organizationId", "name");

-- CreateIndex
CREATE INDEX "finance_commission_assignment_organizationId_userId_validFr_idx" ON "finance_commission_assignment"("organizationId", "userId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "finance_commission_period_close_organizationId_period_key" ON "finance_commission_period_close"("organizationId", "period");

-- CreateIndex
CREATE INDEX "finance_commission_statement_organizationId_period_idx" ON "finance_commission_statement"("organizationId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "finance_commission_statement_organizationId_userId_period_key" ON "finance_commission_statement"("organizationId", "userId", "period");

-- CreateIndex
CREATE INDEX "finance_deal_organizationId_commissionStatus_idx" ON "finance_deal"("organizationId", "commissionStatus");

-- CreateIndex
CREATE INDEX "finance_deal_salesUserId_soldAt_idx" ON "finance_deal"("salesUserId", "soldAt");

-- AddForeignKey
ALTER TABLE "finance_deal" ADD CONSTRAINT "finance_deal_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_commission_model" ADD CONSTRAINT "finance_commission_model_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_commission_assignment" ADD CONSTRAINT "finance_commission_assignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_commission_assignment" ADD CONSTRAINT "finance_commission_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_commission_assignment" ADD CONSTRAINT "finance_commission_assignment_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "finance_commission_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_commission_period_close" ADD CONSTRAINT "finance_commission_period_close_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_commission_statement" ADD CONSTRAINT "finance_commission_statement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_commission_statement" ADD CONSTRAINT "finance_commission_statement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
