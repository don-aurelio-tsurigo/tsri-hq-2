import { NextResponse } from "next/server";
import { CampaignStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
      startDate: { lte: now },
      endDate: { gte: now },
      creatives: { some: {} },
    },
    select: {
      id: true,
      creatives: {
        select: {
          id: true,
          type: true,
          mediaUrl: true,
          targetUrl: true,
        },
      },
    },
  });

  if (campaigns.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const campaign = campaigns[Math.floor(Math.random() * campaigns.length)]!;
  const creatives = campaign.creatives;
  if (creatives.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const creative = creatives[Math.floor(Math.random() * creatives.length)]!;

  return NextResponse.json({
    creativeId: creative.id,
    type: creative.type,
    mediaUrl: creative.mediaUrl,
    targetUrl: creative.targetUrl,
  });
}
