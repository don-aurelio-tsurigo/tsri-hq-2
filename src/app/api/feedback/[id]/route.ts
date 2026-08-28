import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  clientIp,
  consumeFeedbackRateLimit,
  parseFeedbackId,
  sanitizeFeedbackComment,
} from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentBody = { comment?: unknown };

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
    select: { id: true, confirmedAt: true, commentAddedAt: true },
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

  return NextResponse.json({ ok: true });
}
