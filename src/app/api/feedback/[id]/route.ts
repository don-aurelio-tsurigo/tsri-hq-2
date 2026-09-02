import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  clientIp,
  consumeFeedbackRateLimit,
  feedbackCommentRedirectUrl,
  parseFeedbackId,
  sanitizeFeedbackComment,
  toPublicFeedbackVote,
} from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type CommentBody = { comment?: unknown };

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const ip = clientIp(request);
  if (!consumeFeedbackRateLimit(ip)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: NO_STORE },
    );
  }

  const { id: rawId } = await ctx.params;
  const id = parseFeedbackId(rawId);
  if (!id) {
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: NO_STORE },
    );
  }

  const existing = await prisma.feedbackResponse.findUnique({
    where: { id },
    select: {
      id: true,
      newsletter: true,
      campaignId: true,
      issueDate: true,
      rating: true,
      confirmedAt: true,
    },
  });
  const vote = existing ? toPublicFeedbackVote(existing) : null;
  if (!vote) {
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: NO_STORE },
    );
  }

  return NextResponse.json(vote, { headers: NO_STORE });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const ip = clientIp(request);
  if (!consumeFeedbackRateLimit(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: rawId } = await ctx.params;
  const id = parseFeedbackId(rawId);
  if (!id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: CommentBody;
  try {
    body = (await request.json()) as CommentBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const comment = sanitizeFeedbackComment(body.comment);
  if (!comment) {
    return NextResponse.json({ error: "comment required" }, { status: 400 });
  }

  const existing = await prisma.feedbackResponse.findUnique({
    where: { id },
    select: {
      id: true,
      confirmedAt: true,
      commentAddedAt: true,
      membershipStatus: true,
    },
  });
  if (!existing || !existing.confirmedAt) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (existing.commentAddedAt) {
    return NextResponse.json({ error: "already commented" }, { status: 409 });
  }

  await prisma.feedbackResponse.update({
    where: { id },
    data: { comment, commentAddedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    redirectTo: feedbackCommentRedirectUrl(existing.membershipStatus),
  });
}
