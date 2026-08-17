import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: number | undefined;
  prismaPool: Pool | undefined;
};

/**
 * Bump when schema changes that stale hot-reload clients would miss
 * (especially new enum values — Prisma 7 runtimeDataModel.enums is empty).
 */
const PRISMA_CLIENT_SCHEMA_VERSION = 33; // v33: drop named statements (42P05)

/** Fields/relations that must exist after schema pushes — invalidates stale hot-reload clients. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  User: ["phone", "birthDate", "privateNotes"],
  Task: ["groupId", "dueOffsetDays", "archivedAt"],
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
  Campaign: ["impressionLimit"],
  CarouselPost: ["format"],
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
  "CarouselPost",
  "Campaign",
  "Creative",
  "AdEvent",
  "PayrexxPayout",
  "PayrexxPayoutLine",
  "PayrexxChannelRule",
  "MemberUsage",
  "UploadBatch",
  "Asset",
  "Collection",
  "AssetCollection",
  "ExportLog",
] as const;

function pgErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as {
    code?: string;
    message?: string;
    meta?: { driverAdapterError?: { message?: string } };
  };
  const msg = `${e.message ?? ""} ${e.meta?.driverAdapterError?.message ?? ""}`;
  return msg.match(/Code: `([^`]+)`/)?.[1] ?? e.code ?? null;
}

function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: string;
    message?: string;
    meta?: { driverAdapterError?: { message?: string } };
  };
  const msg = `${e.message ?? ""} ${e.meta?.driverAdapterError?.message ?? ""}`;
  const pgCode = pgErrorCode(error);
  return (
    e.code === "P1017" ||
    e.code === "ECONNRESET" ||
    e.code === "57P01" ||
    e.code === "08P01" ||
    e.code === "42P05" ||
    pgCode === "08P01" ||
    pgCode === "42P05" ||
    /08P01/.test(msg) ||
    /42P05/.test(msg) ||
    /bind message supplies \d+ parameters/i.test(msg) ||
    /prepared statement .* already exists/i.test(msg) ||
    /Server has closed the connection/i.test(msg) ||
    /Connection terminated unexpectedly/i.test(msg) ||
    /read ECONNRESET/i.test(msg)
  );
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  globalForPrisma.prismaPool = pool;

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  // Retry once on flaky local Prisma Postgres drops (ECONNRESET / P1017).
  // Use $extends (not a Proxy) so Better Auth joins keep working.
  const withRetry = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          try {
            return await query(args);
          } catch (error) {
            if (!isTransientDbError(error)) throw error;
            return await query(args);
          }
        },
      },
    },
  });

  return withRetry as unknown as PrismaClient;
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

  if (globalForPrisma.prismaPool) {
    void globalForPrisma.prismaPool.end().catch(() => {});
    globalForPrisma.prismaPool = undefined;
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
