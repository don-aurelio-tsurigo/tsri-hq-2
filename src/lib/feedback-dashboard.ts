import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  assembleIssueSummaries,
  attachCommentsToIssues,
  isFeedbackRating,
  normalizeMembershipStatus,
  parseNewsletterSlug,
  type FeedbackCommentListItem,
  type FeedbackVoteListItem,
  type IssueSummary,
  type IssueWithComments,
} from "@/lib/feedback";

const CONFIRMED = { confirmedAt: { not: null } } as const;

export async function listConfirmedNewsletters(): Promise<string[]> {
  const rows = await prisma.feedbackResponse.groupBy({
    by: ["newsletter"],
    where: CONFIRMED,
    orderBy: { newsletter: "asc" },
  });
  return rows.map((row) => row.newsletter);
}

export async function listIssueSummaries(
  newsletter: string,
): Promise<IssueSummary[]> {
  const slug = parseNewsletterSlug(newsletter);
  if (!slug) return [];

  const rows = await prisma.feedbackResponse.groupBy({
    by: ["issueDate", "campaignId", "rating"],
    where: { ...CONFIRMED, newsletter: slug },
    _count: { _all: true },
  });

  return assembleIssueSummaries(rows);
}

export async function listIssuesWithComments(
  newsletter: string,
): Promise<IssueWithComments[]> {
  const [issues, { comments }] = await Promise.all([
    listIssueSummaries(newsletter),
    listFeedbackComments({ newsletter, take: 10_000 }),
  ]);
  return attachCommentsToIssues(issues, comments);
}

export async function listFeedbackComments(input: {
  newsletter?: string | null;
  rating?: string | null;
  q?: string | null;
  take?: number;
}): Promise<{ comments: FeedbackCommentListItem[]; hasMore: boolean }> {
  const take = Math.min(Math.max(input.take ?? 200, 1), 10_000);
  const newsletter = parseNewsletterSlug(input.newsletter ?? null);
  const ratingRaw = input.rating?.trim().toUpperCase() ?? "";
  const rating = isFeedbackRating(ratingRaw) ? ratingRaw : null;
  const q = input.q?.trim().slice(0, 200) || null;

  const where: Prisma.FeedbackResponseWhereInput = {
    ...CONFIRMED,
    commentAddedAt: { not: null },
    comment: q
      ? { contains: q, mode: "insensitive" }
      : { not: null },
    ...(newsletter ? { newsletter } : {}),
    ...(rating ? { rating } : {}),
  };

  const rows = await prisma.feedbackResponse.findMany({
    where,
    orderBy: { commentAddedAt: "desc" },
    take: take + 1,
    select: {
      id: true,
      newsletter: true,
      campaignId: true,
      issueDate: true,
      rating: true,
      comment: true,
      commentAddedAt: true,
      email: true,
      membershipStatus: true,
    },
  });

  const hasMore = rows.length > take;
  const sliced = hasMore ? rows.slice(0, take) : rows;
  const comments: FeedbackCommentListItem[] = [];
  for (const row of sliced) {
    if (!row.comment || !row.commentAddedAt) continue;
    if (!isFeedbackRating(row.rating)) continue;
    comments.push({
      id: row.id,
      newsletter: row.newsletter,
      campaignId: row.campaignId,
      issueDate: row.issueDate,
      rating: row.rating,
      comment: row.comment,
      commentAddedAt: row.commentAddedAt.toISOString(),
      email: row.email,
      membershipStatus: normalizeMembershipStatus(row.membershipStatus),
    });
  }
  return { comments, hasMore };
}

export async function listFeedbackVotes(input: {
  newsletter?: string | null;
  rating?: string | null;
  q?: string | null;
  take?: number;
}): Promise<{ votes: FeedbackVoteListItem[]; hasMore: boolean }> {
  const take = Math.min(Math.max(input.take ?? 500, 1), 10_000);
  const newsletter = parseNewsletterSlug(input.newsletter ?? null);
  const ratingRaw = input.rating?.trim().toUpperCase() ?? "";
  const rating = isFeedbackRating(ratingRaw) ? ratingRaw : null;
  const q = input.q?.trim().slice(0, 200) || null;

  const where: Prisma.FeedbackResponseWhereInput = {
    ...CONFIRMED,
    ...(newsletter ? { newsletter } : {}),
    ...(rating ? { rating } : {}),
    ...(q
      ? { email: { contains: q, mode: "insensitive" } }
      : {}),
  };

  const rows = await prisma.feedbackResponse.findMany({
    where,
    orderBy: { confirmedAt: "desc" },
    take: take + 1,
    select: {
      id: true,
      newsletter: true,
      campaignId: true,
      issueDate: true,
      rating: true,
      email: true,
      membershipStatus: true,
      confirmedAt: true,
    },
  });

  const hasMore = rows.length > take;
  const sliced = hasMore ? rows.slice(0, take) : rows;
  const votes: FeedbackVoteListItem[] = [];
  for (const row of sliced) {
    if (!row.confirmedAt) continue;
    if (!isFeedbackRating(row.rating)) continue;
    votes.push({
      id: row.id,
      newsletter: row.newsletter,
      campaignId: row.campaignId,
      issueDate: row.issueDate,
      rating: row.rating,
      email: row.email,
      membershipStatus: normalizeMembershipStatus(row.membershipStatus),
      confirmedAt: row.confirmedAt.toISOString(),
    });
  }
  return { votes, hasMore };
}
