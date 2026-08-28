import { NextResponse } from "next/server";
import { feedbackCommentsToCsv } from "@/lib/feedback";
import { listFeedbackComments } from "@/lib/feedback-dashboard";
import { requireMembership } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireMembership();
  const url = new URL(request.url);
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
    })),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="newsletter-feedback-${stamp}.csv"`,
    },
  });
}
