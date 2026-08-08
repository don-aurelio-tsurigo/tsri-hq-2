import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: number | undefined;
};

/**
 * Bump when schema changes that stale hot-reload clients would miss
 * (especially new enum values — Prisma 7 runtimeDataModel.enums is empty).
 */
const PRISMA_CLIENT_SCHEMA_VERSION = 23; // v23: Task/Article/Chore split

/** Fields/relations that must exist after schema pushes — invalidates stale hot-reload clients. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  User: ["phone", "birthDate", "privateNotes"],
  Task: ["groupId", "dueOffsetDays"],
  Article: [
    "stage",
    "categoryId",
    "eigenleistungRubrikId",
    "publishAt",
    "archivedAt",
  ],
  Chore: ["assignments"],
  Space: ["archivedAt", "isTemplate"],
  NewsletterType: ["weekdays", "requiresWordle"],
  NewsletterCampaign: ["wordleWord"],
  NewsletterBlockedRange: ["newsletterTypeId"],
  Membership: ["pensumPercent", "archivedAt"],
  CookingSlot: ["assignedById"],
  Organization: [
    "hideNewsletterHolidays",
    "slackCookingWeeklyEnabled",
    "slackCookingWeeklyWebhookUrl",
    "slackCookingMonthlyEnabled",
    "slackCookingMonthlyWebhookUrl",
    "slackCookingWeeklyLastKey",
    "slackCookingMonthlyLastKey",
  ],
  TimeEntry: ["segments"],
  TimeSegment: ["type", "startTime", "endTime"],
};

const REQUIRED_MODELS = [
  "Article",
  "Chore",
  "ChoreAssignment",
  "TaskGroup",
  "CookingSlot",
  "NewsletterType",
  "NewsletterCampaign",
  "NewsletterBlockedRange",
  "VacationRequest",
  "TimeEntry",
  "TimeSegment",
  "EigenleistungRubrik",
  "ArticleCategory",
  "WikiPage",
  "PasswordResetToken",
] as const;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function clientMatchesSchema(client: PrismaClient) {
  try {
    const anyPrisma = client as unknown as {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: { name: string }[] }>;
      };
    };
    const models = anyPrisma._runtimeDataModel?.models;
    if (!models) return false;

    for (const modelName of REQUIRED_MODELS) {
      if (!models[modelName]) return false;
    }

    for (const [modelName, fields] of Object.entries(REQUIRED_FIELDS)) {
      const model = models[modelName];
      if (!model?.fields) return false;
      const names = new Set(model.fields.map((f) => f.name));
      for (const field of fields) {
        if (!names.has(field)) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function getPrismaClient() {
  const existing = globalForPrisma.prisma;
  const versionOk =
    globalForPrisma.prismaSchemaVersion === PRISMA_CLIENT_SCHEMA_VERSION;

  if (existing && versionOk && clientMatchesSchema(existing)) {
    return existing;
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaSchemaVersion = PRISMA_CLIENT_SCHEMA_VERSION;
  return client;
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = PRISMA_CLIENT_SCHEMA_VERSION;
}
