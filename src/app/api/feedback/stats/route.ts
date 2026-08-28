import { NextResponse } from "next/server";
import { Rating } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  buildFeedbackStats,
  clientIp,
  consumeFeedbackRateLimit,
  parseFeedbackStatsQuery,
} from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIp(request);
  if (!consumeFeedbackRateLimit(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = parseFeedbackStatsQuery({
    newsletter: url.searchParams.get("newsletter"),
    campaign: url.searchParams.get("campaign"),
  });
  if (!parsed) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }

  const whereCampaign = {
    newsletter: parsed.newsletter,
    campaignId: parsed.campaignId,
  };
  const [positive, neutral, negative, sample] = await Promise.all([
    prisma.feedbackResponse.count({
      where: {
        ...whereCampaign,
        confirmedAt: { not: null },
        rating: Rating.POSITIVE,
      },
    }),
    prisma.feedbackResponse.count({
      where: {
        ...whereCampaign,
        confirmedAt: { not: null },
        rating: Rating.NEUTRAL,
      },
    }),
    prisma.feedbackResponse.count({
      where: {
        ...whereCampaign,
        confirmedAt: { not: null },
        rating: Rating.NEGATIVE,
      },
    }),
    prisma.feedbackResponse.findFirst({
      where: whereCampaign,
      orderBy: { createdAt: "desc" },
      select: { issueDate: true },
    }),
  ]);

  const rows = [
    { rating: Rating.POSITIVE, _count: { _all: positive } },
    { rating: Rating.NEUTRAL, _count: { _all: neutral } },
    { rating: Rating.NEGATIVE, _count: { _all: negative } },
  ];

  return NextResponse.json(
    buildFeedbackStats({
      newsletter: parsed.newsletter,
      campaignId: parsed.campaignId,
      issueDate: sample?.issueDate ?? null,
      rows,
    }),
  );
}
