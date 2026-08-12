import { format } from "date-fns";
import { CreativeType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { AdCampaignRow } from "@/lib/ads-shared";

export type { AdCampaignRow } from "@/lib/ads-shared";
export { defaultAdDateRange } from "@/lib/ads-shared";

export async function listAdCampaigns(): Promise<AdCampaignRow[]> {
  const campaigns = await prisma.campaign.findMany({
    include: {
      creatives: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const creativeIds = campaigns.flatMap((c) => c.creatives.map((cr) => cr.id));
  const counts =
    creativeIds.length === 0
      ? []
      : await prisma.adEvent.groupBy({
          by: ["creativeId", "type"],
          where: { creativeId: { in: creativeIds } },
          _count: { _all: true },
        });

  const countMap = new Map<string, { impressions: number; clicks: number }>();
  for (const row of counts) {
    const current = countMap.get(row.creativeId) ?? {
      impressions: 0,
      clicks: 0,
    };
    if (row.type === "IMPRESSION") current.impressions = row._count._all;
    if (row.type === "CLICK") current.clicks = row._count._all;
    countMap.set(row.creativeId, current);
  }

  const now = Date.now();

  const rows: AdCampaignRow[] = campaigns.map((c) => {
    const creative = c.creatives[0];
    let impressions = 0;
    let clicks = 0;
    for (const cr of c.creatives) {
      const stats = countMap.get(cr.id);
      if (stats) {
        impressions += stats.impressions;
        clicks += stats.clicks;
      }
    }

    return {
      id: c.id,
      creativeId: creative?.id ?? "",
      name: c.name,
      startDate: format(c.startDate, "yyyy-MM-dd"),
      endDate: format(c.endDate, "yyyy-MM-dd"),
      status: c.status,
      type: creative?.type ?? CreativeType.IMAGE,
      mediaUrl: creative?.mediaUrl ?? "",
      targetUrl: creative?.targetUrl ?? "",
      impressions,
      clicks,
    };
  });

  rows.sort((a, b) => {
    const aExpired = new Date(`${a.endDate}T23:59:59.999`).getTime() < now;
    const bExpired = new Date(`${b.endDate}T23:59:59.999`).getTime() < now;
    const aActive = a.status === "ACTIVE" && !aExpired;
    const bActive = b.status === "ACTIVE" && !bExpired;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.endDate.localeCompare(b.endDate);
  });

  return rows;
}
