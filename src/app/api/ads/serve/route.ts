import { NextResponse } from "next/server";
import { AdEventType, CampaignStatus } from "@/generated/prisma/client";
import { adsCorsPreflight, withAdsCors } from "@/lib/ads-cors";
import {
  parseZurichDayEnd,
  parseZurichDayStart,
  zurichDateKey,
} from "@/lib/ads-shared";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return adsCorsPreflight(request);
}

export async function GET(request: Request) {
  const now = new Date();
  // Flight dates are calendar days in Europe/Zurich; Render itself is UTC.
  const today = zurichDateKey(now);
  const todayStart = parseZurichDayStart(today);
  const todayEnd = parseZurichDayEnd(today);

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
      startDate: { lte: todayEnd },
      endDate: { gte: todayStart },
      creatives: { some: {} },
    },
    select: {
      id: true,
      impressionLimit: true,
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

  const creativeIds = campaigns.flatMap((c) => c.creatives.map((cr) => cr.id));
  const impressionRows =
    creativeIds.length === 0
      ? []
      : await prisma.adEvent.groupBy({
          by: ["creativeId"],
          where: {
            creativeId: { in: creativeIds },
            type: AdEventType.IMPRESSION,
          },
          _count: { _all: true },
        });

  const impressionsByCreative = new Map(
    impressionRows.map((r) => [r.creativeId, r._count._all]),
  );

  const eligible = campaigns.filter((c) => {
    if (c.impressionLimit == null) return true;
    let total = 0;
    for (const cr of c.creatives) {
      total += impressionsByCreative.get(cr.id) ?? 0;
    }
    return total < c.impressionLimit;
  });

  if (eligible.length === 0) {
    return withAdsCors(request, new NextResponse(null, { status: 204 }));
  }

  const campaign = eligible[Math.floor(Math.random() * eligible.length)]!;
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
