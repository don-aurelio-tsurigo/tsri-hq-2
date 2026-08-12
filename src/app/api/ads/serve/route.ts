import { NextResponse } from "next/server";
import { CampaignStatus } from "@/generated/prisma/client";
import { adsCorsPreflight, withAdsCors } from "@/lib/ads-cors";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return adsCorsPreflight(request);
}

export async function GET(request: Request) {
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
    return withAdsCors(request, new NextResponse(null, { status: 204 }));
  }

  const campaign = campaigns[Math.floor(Math.random() * campaigns.length)]!;
  const creatives = campaign.creatives;
  if (creatives.length === 0) {
    return withAdsCors(request, new NextResponse(null, { status: 204 }));
  }

  const creative = creatives[Math.floor(Math.random() * creatives.length)]!;

  return withAdsCors(
    request,
    NextResponse.json({
      creativeId: creative.id,
      type: creative.type,
      mediaUrl: creative.mediaUrl,
      targetUrl: creative.targetUrl,
    }),
  );
}
