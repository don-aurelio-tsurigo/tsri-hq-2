import type { NewsItemStatus } from "@/generated/prisma/client";

export type FeedSource = {
  key: string;
  label: string;
  url: string;
  /** Paywall / Audio — nur Teaser im RSS */
  requiresFulltext?: boolean;
};

export const RSS_SOURCES: FeedSource[] = [
  {
    key: "stadt-zuerich-medienmitteilungen",
    label: "Stadt Zürich – Medienmitteilungen",
    url: "https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen/_jcr_content/mainparsys/teaser.rss",
  },
  {
    key: "gemeinderat-zuerich",
    label: "Gemeinderat Zürich",
    url: "https://www.gemeinderat-zuerich.ch/de/geschaefte/export.php?export=rss",
  },
  {
    key: "tagesanzeiger-zuerich",
    label: "Tages-Anzeiger Zürich",
    url: "https://partner-feeds.publishing.tamedia.ch/rss/tagesanzeiger/zuerich",
    requiresFulltext: true,
  },
  {
    key: "20min-zuerich",
    label: "20 Minuten Zürich",
    url: "https://partner-feeds.20min.ch/rss/20minuten/regionen/zuerich",
  },
  {
    key: "nzz-zuerich",
    label: "NZZ Zürich",
    url: "https://www.nzz.ch/zuerich.rss",
    requiresFulltext: true,
  },
  {
    key: "blick-zuerich",
    label: "Blick Zürich",
    url: "https://www.blick.ch/schweiz/zuerich/rss.xml",
  },
  {
    key: "srf-regionaljournal-zh-sh",
    label: "SRF Regionaljournal ZH/SH",
    url: "https://www.srf.ch/feed/podcast/sd/5e266ba0-f769-4d6d-bd41-e01f188dd106.xml",
    requiresFulltext: true,
  },
];

export const TAGBLATT_SOURCE = {
  key: "tagblatt-zuerich",
  label: "Tagblatt der Stadt Zürich",
} as const;

export const TAGBLATT_URL = "https://www.tagblattzuerich.ch/zuerich";

export const BAUGESUCHE_SOURCE = {
  key: "baugesuche-zh",
  label: "Baugesuche Stadt Zürich",
} as const;

export const BAUGESUCHE_MAX_AGE_DAYS = 30;
export const BAUGESUCHE_TOWN = "Zürich";
export const GEMEINDERAT_MAX_AGE_DAYS = 45;

export const FEED_USER_AGENT = "TsueriNewsFeed/1.0 (+https://tsri.ch)";

export const NEWS_ITEM_STATUSES: NewsItemStatus[] = [
  "neu",
  "interessant",
  "beobachten",
  "verworfen",
];

export const NEWS_ITEM_STATUS_LABELS: Record<NewsItemStatus, string> = {
  neu: "Neu",
  interessant: "Interessant",
  beobachten: "Beobachten",
  verworfen: "Verworfen",
};

export function allFeedSources(): {
  key: string;
  label: string;
  requiresFulltext: boolean;
}[] {
  return [
    ...RSS_SOURCES.map((s) => ({
      key: s.key,
      label: s.label,
      requiresFulltext: !!s.requiresFulltext,
    })),
    { ...BAUGESUCHE_SOURCE, requiresFulltext: false },
    { ...TAGBLATT_SOURCE, requiresFulltext: false },
  ];
}

export function isNewsItemStatus(value: string): value is NewsItemStatus {
  return (NEWS_ITEM_STATUSES as string[]).includes(value);
}
