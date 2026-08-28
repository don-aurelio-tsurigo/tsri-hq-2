import type { Rating } from "@/generated/prisma/client";

export const FEEDBACK_RATINGS = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export const FEEDBACK_RATING_LABELS: Record<FeedbackRating, string> = {
  POSITIVE: "Gut",
  NEUTRAL: "Geht so",
  NEGATIVE: "Nicht so gut",
};

const NEWSLETTER_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CAMPAIGN_RE = /^[A-Za-z0-9._-]{1,128}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export const FEEDBACK_MEMBERSHIP_STATUSES = [-1, 0, 1] as const;
export type FeedbackMembershipStatus =
  (typeof FEEDBACK_MEMBERSHIP_STATUSES)[number];

export const FEEDBACK_MEMBERSHIP_LABELS: Record<
  FeedbackMembershipStatus,
  string
> = {
  1: "Mitglied",
  0: "Kein Mitglied",
  [-1]: "Ausgetreten",
};

export type FeedbackClickInput = {
  newsletter: string;
  campaignId: string;
  issueDate: string;
  rating: FeedbackRating;
  email: string | null;
  membershipStatus: FeedbackMembershipStatus;
};

export function isFeedbackRating(value: string): value is FeedbackRating {
  return (FEEDBACK_RATINGS as readonly string[]).includes(value);
}

export function isFeedbackMembershipStatus(
  value: number,
): value is FeedbackMembershipStatus {
  return (FEEDBACK_MEMBERSHIP_STATUSES as readonly number[]).includes(value);
}

/** Empty or unknown membership is stored/shown as not a member (0). */
export function normalizeMembershipStatus(
  value: number | null | undefined,
): FeedbackMembershipStatus {
  if (value !== null && value !== undefined && isFeedbackMembershipStatus(value)) {
    return value;
  }
  return 0;
}

function parseOptionalEmail(value: string | null | undefined): string | null | false {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  if (raw.length > MAX_EMAIL_LENGTH) return false;
  const email = raw.toLowerCase();
  if (!EMAIL_RE.test(email)) return false;
  return email;
}

function parseMembershipStatus(
  value: string | null | undefined,
): FeedbackMembershipStatus | false {
  const raw = value?.trim() ?? "";
  if (!raw || raw === "0") return 0;
  if (raw === "1") return 1;
  if (raw === "-1") return -1;
  return false;
}

export function parseFeedbackClickInput(params: {
  newsletter: string | null;
  campaign: string | null;
  date: string | null;
  rating: string | null;
  email?: string | null;
  membership?: string | null;
}): FeedbackClickInput | null {
  const newsletter = params.newsletter?.trim() ?? "";
  const campaignId = params.campaign?.trim() ?? "";
  const issueDate = params.date?.trim() ?? "";
  const rating = params.rating?.trim().toUpperCase() ?? "";
  const email = parseOptionalEmail(params.email);
  const membershipStatus = parseMembershipStatus(params.membership);

  if (!NEWSLETTER_RE.test(newsletter)) return null;
  if (!CAMPAIGN_RE.test(campaignId)) return null;
  if (!DATE_RE.test(issueDate)) return null;
  if (!isFeedbackRating(rating)) return null;
  if (email === false || membershipStatus === false) return null;
  return { newsletter, campaignId, issueDate, rating, email, membershipStatus };
}

export function parseFeedbackId(value: string | null | undefined): string | null {
  const id = value?.trim() ?? "";
  return UUID_RE.test(id) ? id : null;
}

export function parseFeedbackStatsQuery(params: {
  newsletter: string | null;
  campaign: string | null;
}): { newsletter: string; campaignId: string } | null {
  const newsletter = params.newsletter?.trim() ?? "";
  const campaignId = params.campaign?.trim() ?? "";
  if (!NEWSLETTER_RE.test(newsletter)) return null;
  if (!CAMPAIGN_RE.test(campaignId)) return null;
  return { newsletter, campaignId };
}

export function truncateUserAgent(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 512);
}

export function sanitizeFeedbackComment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const comment = value.trim().slice(0, 2000);
  return comment.length > 0 ? comment : null;
}

export type FeedbackCounts = Record<FeedbackRating, number>;

export type FeedbackStats = {
  newsletter: string;
  campaignId: string;
  issueDate: string | null;
  total: number;
  counts: FeedbackCounts;
  percentages: FeedbackCounts;
};

export function emptyFeedbackCounts(): FeedbackCounts {
  return { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
}

export function buildFeedbackStats(input: {
  newsletter: string;
  campaignId: string;
  issueDate: string | null;
  rows: { rating: Rating; _count: { _all: number } }[];
}): FeedbackStats {
  const counts = emptyFeedbackCounts();
  for (const row of input.rows) {
    if (isFeedbackRating(row.rating)) {
      counts[row.rating] = row._count._all;
    }
  }
  const total = counts.POSITIVE + counts.NEUTRAL + counts.NEGATIVE;
  const percentages = emptyFeedbackCounts();
  if (total > 0) {
    percentages.POSITIVE = Math.round((counts.POSITIVE / total) * 100);
    percentages.NEUTRAL = Math.round((counts.NEUTRAL / total) * 100);
    percentages.NEGATIVE = Math.round((counts.NEGATIVE / total) * 100);
  }
  return {
    newsletter: input.newsletter,
    campaignId: input.campaignId,
    issueDate: input.issueDate,
    total,
    counts,
    percentages,
  };
}

/** "2026-08-28" → "28.08." */
export function formatIssueDateLabel(issueDate: string): string {
  if (!DATE_RE.test(issueDate)) return issueDate;
  const [, month, day] = issueDate.split("-");
  return `${day}.${month}.`;
}

/** "2026-08-28" → "28.08.2026" */
export function formatIssueDateFull(issueDate: string): string {
  if (!DATE_RE.test(issueDate)) return issueDate;
  const [year, month, day] = issueDate.split("-");
  return `${day}.${month}.${year}`;
}

export function parseNewsletterSlug(
  value: string | null | undefined,
): string | null {
  const newsletter = value?.trim() ?? "";
  return NEWSLETTER_RE.test(newsletter) ? newsletter : null;
}

export const KNOWN_NEWSLETTER_LABELS: Record<string, string> = {
  "zueri-briefing": "Züri Briefing",
  tsueritipp: "Tsüritipp",
  wohnbrief: "Wohnbrief",
};

export function newsletterLabel(slug: string): string {
  return KNOWN_NEWSLETTER_LABELS[slug] ?? slug;
}

export type IssueSummary = {
  issueDate: string;
  campaignId: string;
  total: number;
  counts: FeedbackCounts;
  percentages: FeedbackCounts;
  /** 0–100 from weighted POSITIVE=1, NEUTRAL=0, NEGATIVE=-1. */
  score: number | null;
};

export function issueFeedbackKey(issueDate: string, campaignId: string): string {
  return `${issueDate}\t${campaignId}`;
}

/** Weighted mean in [-1, 1], mapped to 0–100. */
export function satisfactionScore(counts: FeedbackCounts): number | null {
  const total = counts.POSITIVE + counts.NEUTRAL + counts.NEGATIVE;
  if (total === 0) return null;
  const raw = (counts.POSITIVE - counts.NEGATIVE) / total;
  return Math.round((raw + 1) * 50);
}

export function assembleIssueSummaries(
  rows: {
    issueDate: string;
    campaignId: string;
    rating: Rating;
    _count: { _all: number };
  }[],
): IssueSummary[] {
  const map = new Map<
    string,
    { issueDate: string; campaignId: string; counts: FeedbackCounts }
  >();
  for (const row of rows) {
    if (!isFeedbackRating(row.rating)) continue;
    const key = issueFeedbackKey(row.issueDate, row.campaignId);
    const current = map.get(key) ?? {
      issueDate: row.issueDate,
      campaignId: row.campaignId,
      counts: emptyFeedbackCounts(),
    };
    current.counts[row.rating] += row._count._all;
    map.set(key, current);
  }

  return [...map.values()]
    .map((item) => {
      const stats = buildFeedbackStats({
        newsletter: "",
        campaignId: item.campaignId,
        issueDate: item.issueDate,
        rows: FEEDBACK_RATINGS.map((rating) => ({
          rating,
          _count: { _all: item.counts[rating] },
        })),
      });
      return {
        issueDate: item.issueDate,
        campaignId: item.campaignId,
        total: stats.total,
        counts: stats.counts,
        percentages: stats.percentages,
        score: satisfactionScore(stats.counts),
      };
    })
    .sort((a, b) => {
      const byDate = b.issueDate.localeCompare(a.issueDate);
      if (byDate !== 0) return byDate;
      return b.campaignId.localeCompare(a.campaignId);
    });
}

export type FeedbackCommentCsvRow = {
  issueDate: string;
  rating: FeedbackRating;
  comment: string;
  email: string | null;
  membershipStatus: FeedbackMembershipStatus;
};

export type FeedbackCommentListItem = {
  id: string;
  newsletter: string;
  campaignId: string;
  issueDate: string;
  rating: FeedbackRating;
  comment: string;
  commentAddedAt: string;
  email: string | null;
  membershipStatus: FeedbackMembershipStatus;
};

export type IssueWithComments = IssueSummary & {
  comments: FeedbackCommentListItem[];
};

export function attachCommentsToIssues(
  issues: IssueSummary[],
  comments: FeedbackCommentListItem[],
): IssueWithComments[] {
  const byIssue = new Map<string, FeedbackCommentListItem[]>();
  for (const comment of comments) {
    const key = issueFeedbackKey(comment.issueDate, comment.campaignId);
    const list = byIssue.get(key);
    if (list) list.push(comment);
    else byIssue.set(key, [comment]);
  }
  return issues.map((issue) => ({
    ...issue,
    comments:
      byIssue.get(issueFeedbackKey(issue.issueDate, issue.campaignId)) ?? [],
  }));
}

function csvCell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function feedbackCommentsToCsv(rows: FeedbackCommentCsvRow[]): string {
  const header = ["issueDate", "rating", "comment", "email", "membershipStatus"].join(
    ";",
  );
  const lines = rows.map((row) =>
    [
      csvCell(row.issueDate),
      csvCell(row.rating),
      csvCell(row.comment),
      csvCell(row.email ?? ""),
      csvCell(String(row.membershipStatus)),
    ].join(";"),
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_BUCKETS = 2_000;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

export function consumeFeedbackRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (rateBuckets.size > MAX_BUCKETS) {
      for (const [key, entry] of rateBuckets) {
        if (now >= entry.resetAt) rateBuckets.delete(key);
      }
    }
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

/** Test helper — not used in production routes. */
export function resetFeedbackRateLimit() {
  rateBuckets.clear();
}
