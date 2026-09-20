-- CreateEnum
CREATE TYPE "EditorialCalendarFrequency" AS ENUM ('once', 'weekly', 'monthly', 'yearly', 'every_n_years');

-- CreateEnum
CREATE TYPE "EditorialCalendarDateMode" AS ENUM ('fixed', 'rule', 'pending');

-- CreateTable
CREATE TABLE "editorial_calendar_category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e5e7eb',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editorial_calendar_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_calendar_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "frequency" "EditorialCalendarFrequency" NOT NULL,
    "dateMode" "EditorialCalendarDateMode" NOT NULL,
    "date" DATE,
    "day" INTEGER,
    "month" INTEGER,
    "ruleWeekday" INTEGER,
    "ruleNth" INTEGER,
    "ruleMonth" INTEGER,
    "intervalYears" INTEGER,
    "anchorYear" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editorial_calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_calendar_occurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editorial_calendar_occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "editorial_calendar_category_organizationId_sortOrder_idx" ON "editorial_calendar_category"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_calendar_category_organizationId_name_key" ON "editorial_calendar_category"("organizationId", "name");

-- CreateIndex
CREATE INDEX "editorial_calendar_event_organizationId_archivedAt_idx" ON "editorial_calendar_event"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "editorial_calendar_event_categoryId_idx" ON "editorial_calendar_event"("categoryId");

-- CreateIndex
CREATE INDEX "editorial_calendar_event_createdById_idx" ON "editorial_calendar_event"("createdById");

-- CreateIndex
CREATE INDEX "editorial_calendar_occurrence_eventId_year_idx" ON "editorial_calendar_occurrence"("eventId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_calendar_occurrence_eventId_year_key" ON "editorial_calendar_occurrence"("eventId", "year");

-- AddForeignKey
ALTER TABLE "editorial_calendar_category" ADD CONSTRAINT "editorial_calendar_category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_calendar_event" ADD CONSTRAINT "editorial_calendar_event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_calendar_event" ADD CONSTRAINT "editorial_calendar_event_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "editorial_calendar_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_calendar_event" ADD CONSTRAINT "editorial_calendar_event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_calendar_occurrence" ADD CONSTRAINT "editorial_calendar_occurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "editorial_calendar_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
