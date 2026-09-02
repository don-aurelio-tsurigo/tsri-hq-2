import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  clientIp,
  consumeFeedbackRateLimit,
  parseFeedbackId,
  toPublicFeedbackVote,
} from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfirmBody = { id?: unknown };

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!consumeFeedbackRateLimit(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const id = parseFeedbackId(typeof body.id === "string" ? body.id : null);
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const existing = await prisma.feedbackResponse.findUnique({
    where: { id },
    select: {
      id: true,
      newsletter: true,
      campaignId: true,
      issueDate: true,
      rating: true,
      email: true,
      confirmedAt: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const vote = toPublicFeedbackVote(existing);
  if (!vote) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!existing.confirmedAt) {
    const confirmedAt = new Date();
    await prisma.$transaction([
      ...(existing.email
        ? [
            prisma.feedbackResponse.updateMany({
              where: {
                newsletter: existing.newsletter,
                campaignId: existing.campaignId,
                email: existing.email,
                id: { not: id },
                confirmedAt: { not: null },
              },
              data: { confirmedAt: null },
            }),
          ]
        : []),
      prisma.feedbackResponse.update({
        where: { id },
        data: { confirmedAt },
      }),
    ]);
  }

  return NextResponse.json({ ...vote, confirmed: true });
}
