import { addDays, format } from "date-fns";

/** Client-safe ad campaign row (no Prisma / pg imports). */
export type AdCampaignRow = {
  id: string;
  creativeId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "PAUSED";
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  targetUrl: string;
  impressionLimit: number | null;
  impressions: number;
  clicks: number;
};

export function defaultAdDateRange() {
  const today = new Date();
  return {
    startDate: format(today, "yyyy-MM-dd"),
    endDate: format(addDays(today, 30), "yyyy-MM-dd"),
  };
}
