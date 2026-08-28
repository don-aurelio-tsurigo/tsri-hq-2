import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  clientIp,
  consumeFeedbackRateLimit,
  parseFeedbackId,
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
      confirmedAt: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!existing.confirmedAt) {
    await prisma.feedbackResponse.update({
      where: { id },
      data: { confirmedAt: new Date() },
    });
  }

  return NextResponse.json({
    id: existing.id,
    newsletter: existing.newsletter,
    campaignId: existing.campaignId,
    issueDate: existing.issueDate,
    rating: existing.rating,
  });
}
