import { NextResponse } from "next/server";
import { feedbackCommentsToCsv, feedbackVotesToCsv } from "@/lib/feedback";
import {
  listFeedbackComments,
  listFeedbackVotes,
} from "@/lib/feedback-dashboard";
import { requireMembership } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireMembership();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const stamp = new Date().toISOString().slice(0, 10);

  if (kind === "votes") {
    const { votes } = await listFeedbackVotes({
      newsletter: url.searchParams.get("newsletter"),
      rating: url.searchParams.get("rating"),
      q: url.searchParams.get("q"),
      take: 10_000,
    });
    const csv = feedbackVotesToCsv(votes);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="newsletter-feedback-stimmen-${stamp}.csv"`,
      },
    });
  }

  const { comments } = await listFeedbackComments({
    newsletter: url.searchParams.get("newsletter"),
    rating: url.searchParams.get("rating"),
    q: url.searchParams.get("q"),
    take: 10_000,
  });

  const csv = feedbackCommentsToCsv(
    comments.map((row) => ({
      issueDate: row.issueDate,
      rating: row.rating,
      comment: row.comment,
      email: row.email,
      membershipStatus: row.membershipStatus,
    })),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="newsletter-feedback-${stamp}.csv"`,
    },
  });
}
