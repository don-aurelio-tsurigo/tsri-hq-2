-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "SpaceType" AS ENUM ('personal', 'team', 'project');

-- CreateEnum
CREATE TYPE "SpaceVisibility" AS ENUM ('private', 'team', 'restricted');

-- CreateEnum
CREATE TYPE "SpacePermission" AS ENUM ('view', 'edit', 'admin');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'doing', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "ArticleStage" AS ENUM ('input', 'weiter', 'warteliste', 'abgelehnt', 'in_arbeit', 'bereit', 'publiziert');

-- CreateEnum
CREATE TYPE "NewsletterFrequency" AS ENUM ('daily', 'weekly');

-- CreateEnum
CREATE TYPE "NewsletterCampaignStatus" AS ENUM ('planned', 'published', 'skipped');

-- CreateEnum
CREATE TYPE "VacationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TimeEntryType" AS ENUM ('work', 'sick', 'vacation', 'holiday');

-- CreateEnum
CREATE TYPE "TimeSegmentType" AS ENUM ('work', 'break');

-- CreateEnum
CREATE TYPE "NewsItemStatus" AS ENUM ('neu', 'interessant', 'beobachten', 'verworfen');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "phone" TEXT,
    "birthDate" DATE,
    "privateNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "hideNewsletterHolidays" BOOLEAN NOT NULL DEFAULT false,
    "slackCookingWeeklyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackCookingWeeklyWebhookUrl" TEXT,
    "slackCookingMonthlyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackCookingMonthlyWebhookUrl" TEXT,
    "slackCookingWeeklyLastKey" TEXT,
    "slackCookingMonthlyLastKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'member',
    "pensumPercent" INTEGER NOT NULL DEFAULT 100,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "SpaceType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "SpaceVisibility" NOT NULL DEFAULT 'team',
    "ownerUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "eventAt" DATE,
    "venue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_access" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "SpacePermission" NOT NULL DEFAULT 'view',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e5e7eb',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eigenleistung_rubrik" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e5e7eb',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eigenleistung_rubrik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "groupId" TEXT,
    "dueAt" TIMESTAMP(3),
    "dueOffsetDays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stage" "ArticleStage" NOT NULL DEFAULT 'input',
    "categoryId" TEXT,
    "eigenleistungRubrikId" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "publishAt" DATE,
    "archivedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_group" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chore" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "groupId" TEXT,
    "createdById" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chore_assignment" (
    "id" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chore_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooking_slot" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cooking_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_type" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "NewsletterFrequency" NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "requiresWordle" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_blocked_range" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "newsletterTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_blocked_range_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_campaign" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "authorId" TEXT,
    "createdById" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "campaignUrl" TEXT,
    "status" "NewsletterCampaignStatus" NOT NULL DEFAULT 'published',
    "note" TEXT,
    "wordleWord" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacation_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "status" "VacationStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacation_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "TimeEntryType" NOT NULL DEFAULT 'work',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_segment" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "type" "TimeSegmentType" NOT NULL DEFAULT 'work',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "time_segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_page" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wiki_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "status" "NewsItemStatus" NOT NULL DEFAULT 'neu',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "membership_userId_idx" ON "membership"("userId");

-- CreateIndex
CREATE INDEX "membership_organizationId_archivedAt_idx" ON "membership"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organizationId_userId_key" ON "membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_key" ON "password_reset_token"("token");

-- CreateIndex
CREATE INDEX "password_reset_token_userId_idx" ON "password_reset_token"("userId");

-- CreateIndex
CREATE INDEX "space_ownerUserId_idx" ON "space"("ownerUserId");

-- CreateIndex
CREATE INDEX "space_organizationId_type_idx" ON "space"("organizationId", "type");

-- CreateIndex
CREATE INDEX "space_organizationId_type_archivedAt_idx" ON "space"("organizationId", "type", "archivedAt");

-- CreateIndex
CREATE INDEX "space_organizationId_type_isTemplate_idx" ON "space"("organizationId", "type", "isTemplate");

-- CreateIndex
CREATE UNIQUE INDEX "space_organizationId_slug_key" ON "space"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "space_access_spaceId_userId_key" ON "space_access"("spaceId", "userId");

-- CreateIndex
CREATE INDEX "article_category_organizationId_sortOrder_idx" ON "article_category"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "article_category_organizationId_name_key" ON "article_category"("organizationId", "name");

-- CreateIndex
CREATE INDEX "eigenleistung_rubrik_organizationId_sortOrder_idx" ON "eigenleistung_rubrik"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "eigenleistung_rubrik_organizationId_name_key" ON "eigenleistung_rubrik"("organizationId", "name");

-- CreateIndex
CREATE INDEX "task_spaceId_status_idx" ON "task"("spaceId", "status");

-- CreateIndex
CREATE INDEX "task_spaceId_groupId_idx" ON "task"("spaceId", "groupId");

-- CreateIndex
CREATE INDEX "task_assigneeId_idx" ON "task"("assigneeId");

-- CreateIndex
CREATE INDEX "task_createdById_idx" ON "task"("createdById");

-- CreateIndex
CREATE INDEX "article_spaceId_stage_idx" ON "article"("spaceId", "stage");

-- CreateIndex
CREATE INDEX "article_spaceId_publishAt_idx" ON "article"("spaceId", "publishAt");

-- CreateIndex
CREATE INDEX "article_spaceId_archivedAt_idx" ON "article"("spaceId", "archivedAt");

-- CreateIndex
CREATE INDEX "article_assigneeId_idx" ON "article"("assigneeId");

-- CreateIndex
CREATE INDEX "article_createdById_idx" ON "article"("createdById");

-- CreateIndex
CREATE INDEX "article_categoryId_idx" ON "article"("categoryId");

-- CreateIndex
CREATE INDEX "article_eigenleistungRubrikId_idx" ON "article"("eigenleistungRubrikId");

-- CreateIndex
CREATE INDEX "task_group_spaceId_sortOrder_idx" ON "task_group"("spaceId", "sortOrder");

-- CreateIndex
CREATE INDEX "chore_spaceId_status_idx" ON "chore"("spaceId", "status");

-- CreateIndex
CREATE INDEX "chore_spaceId_groupId_idx" ON "chore"("spaceId", "groupId");

-- CreateIndex
CREATE INDEX "chore_createdById_idx" ON "chore"("createdById");

-- CreateIndex
CREATE INDEX "chore_assignment_userId_idx" ON "chore_assignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "chore_assignment_choreId_userId_key" ON "chore_assignment"("choreId", "userId");

-- CreateIndex
CREATE INDEX "cooking_slot_userId_idx" ON "cooking_slot"("userId");

-- CreateIndex
CREATE INDEX "cooking_slot_assignedById_idx" ON "cooking_slot"("assignedById");

-- CreateIndex
CREATE INDEX "cooking_slot_spaceId_date_idx" ON "cooking_slot"("spaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cooking_slot_spaceId_date_key" ON "cooking_slot"("spaceId", "date");

-- CreateIndex
CREATE INDEX "newsletter_type_organizationId_idx" ON "newsletter_type"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_type_organizationId_name_key" ON "newsletter_type"("organizationId", "name");

-- CreateIndex
CREATE INDEX "newsletter_blocked_range_organizationId_startDate_endDate_idx" ON "newsletter_blocked_range"("organizationId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "newsletter_blocked_range_newsletterTypeId_startDate_endDate_idx" ON "newsletter_blocked_range"("newsletterTypeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "newsletter_campaign_typeId_date_idx" ON "newsletter_campaign"("typeId", "date");

-- CreateIndex
CREATE INDEX "newsletter_campaign_authorId_idx" ON "newsletter_campaign"("authorId");

-- CreateIndex
CREATE INDEX "newsletter_campaign_date_idx" ON "newsletter_campaign"("date");

-- CreateIndex
CREATE INDEX "vacation_request_organizationId_startDate_idx" ON "vacation_request"("organizationId", "startDate");

-- CreateIndex
CREATE INDEX "vacation_request_organizationId_status_idx" ON "vacation_request"("organizationId", "status");

-- CreateIndex
CREATE INDEX "vacation_request_userId_idx" ON "vacation_request"("userId");

-- CreateIndex
CREATE INDEX "time_entry_userId_date_idx" ON "time_entry"("userId", "date");

-- CreateIndex
CREATE INDEX "time_entry_organizationId_date_idx" ON "time_entry"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "time_entry_organizationId_userId_date_key" ON "time_entry"("organizationId", "userId", "date");

-- CreateIndex
CREATE INDEX "time_segment_timeEntryId_sortOrder_idx" ON "time_segment"("timeEntryId", "sortOrder");

-- CreateIndex
CREATE INDEX "wiki_page_spaceId_parentId_sortOrder_idx" ON "wiki_page"("spaceId", "parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "wiki_page_organizationId_pinned_idx" ON "wiki_page"("organizationId", "pinned");

-- CreateIndex
CREATE INDEX "wiki_page_parentId_idx" ON "wiki_page"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "wiki_page_organizationId_slug_key" ON "wiki_page"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "news_item_organizationId_status_idx" ON "news_item"("organizationId", "status");

-- CreateIndex
CREATE INDEX "news_item_organizationId_source_idx" ON "news_item"("organizationId", "source");

-- CreateIndex
CREATE INDEX "news_item_organizationId_publishedAt_idx" ON "news_item"("organizationId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "news_item_organizationId_externalId_key" ON "news_item"("organizationId", "externalId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space" ADD CONSTRAINT "space_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space" ADD CONSTRAINT "space_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_access" ADD CONSTRAINT "space_access_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_access" ADD CONSTRAINT "space_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_category" ADD CONSTRAINT "article_category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eigenleistung_rubrik" ADD CONSTRAINT "eigenleistung_rubrik_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "task_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "article_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_eigenleistungRubrikId_fkey" FOREIGN KEY ("eigenleistungRubrikId") REFERENCES "eigenleistung_rubrik"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_group" ADD CONSTRAINT "task_group_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore" ADD CONSTRAINT "chore_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore" ADD CONSTRAINT "chore_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "task_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore" ADD CONSTRAINT "chore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_assignment" ADD CONSTRAINT "chore_assignment_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_assignment" ADD CONSTRAINT "chore_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_slot" ADD CONSTRAINT "cooking_slot_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_slot" ADD CONSTRAINT "cooking_slot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_slot" ADD CONSTRAINT "cooking_slot_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_type" ADD CONSTRAINT "newsletter_type_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_blocked_range" ADD CONSTRAINT "newsletter_blocked_range_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_blocked_range" ADD CONSTRAINT "newsletter_blocked_range_newsletterTypeId_fkey" FOREIGN KEY ("newsletterTypeId") REFERENCES "newsletter_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_campaign" ADD CONSTRAINT "newsletter_campaign_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "newsletter_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_campaign" ADD CONSTRAINT "newsletter_campaign_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_campaign" ADD CONSTRAINT "newsletter_campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_segment" ADD CONSTRAINT "time_segment_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "wiki_page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_item" ADD CONSTRAINT "news_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
