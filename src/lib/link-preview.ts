import type { Metadata } from "next";

export const SITE_NAME = "Tsüri Hub";
export const SITE_DESCRIPTION =
  "Internes Tsüri-Tool für Redaktion, Projekte und Tasks";

/** Sidebar labels → preview / document title for known app routes. */
const ROUTE_TITLES: { prefix: string; title: string; exact?: boolean }[] = [
  { prefix: "/feedback", title: "Feedback" },
  { prefix: "/home", title: "Home" },
  { prefix: "/inbox", title: "Home" },
  { prefix: "/newsletter", title: "Newsletter" },
  { prefix: "/schichtplan", title: "Schichtplan" },
  { prefix: "/carousel", title: "Social Media" },
  { prefix: "/dam/upload", title: "Upload" },
  { prefix: "/dam/personal", title: "Meine Uploads" },
  { prefix: "/dam/archive", title: "Alle Fotos" },
  { prefix: "/dam/papierkorb", title: "Papierkorb" },
  { prefix: "/dam/review", title: "Alle Fotos" },
  { prefix: "/dam", title: "Alle Fotos", exact: true },
  { prefix: "/tasks", title: "Alle Tasks" },
  { prefix: "/projects", title: "Projekte" },
  { prefix: "/ads", title: "Werbung" },
  { prefix: "/payrexx", title: "Finance" },
  { prefix: "/hours", title: "Meine Arbeitszeit" },
  { prefix: "/settings/newsletter", title: "Newslettereinstellungen" },
  { prefix: "/settings/schichtplan", title: "Schichtplan-Einstellungen" },
  { prefix: "/settings/members", title: "Teamverwaltung" },
  { prefix: "/settings/hours", title: "Teamarbeitszeit" },
  { prefix: "/settings/notifications", title: "Benachrichtigungen" },
  { prefix: "/login", title: "Anmelden" },
  { prefix: "/onboarding", title: "Onboarding" },
  { prefix: "/complete-profile", title: "Profil vervollständigen" },
];

const SPACE_SLUG_TITLES: Record<string, string> = {
  redaktion: "Artikel",
  quellen: "Newsfeed",
  kochplan: "Kochplan",
  ferienplan: "Ferienplan",
  aemliplan: "Ämtliplan",
  "team-infos": "Teaminfos",
  wiki: "Wiki",
};

export function titleForSpaceSlug(slug: string): string | undefined {
  return SPACE_SLUG_TITLES[slug];
}

export function titleForPath(pathname: string): string | undefined {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  if (path === "/" || path === "") return undefined;

  // Longer prefixes first so /dam/upload wins over /dam
  const ranked = [...ROUTE_TITLES].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  );
  for (const route of ranked) {
    if (route.exact) {
      if (path === route.prefix) return route.title;
      continue;
    }
    if (path === route.prefix || path.startsWith(`${route.prefix}/`)) {
      return route.title;
    }
  }
  return undefined;
}

export function formatPreviewTitle(section?: string | null): string {
  const trimmed = section?.trim();
  return trimmed ? `${trimmed} · ${SITE_NAME}` : SITE_NAME;
}

export function pageTitle(section: string): Metadata {
  return { title: section };
}

const LINK_PREVIEW_BOT_RE =
  /Slackbot|Slack-ImgProxy|Twitterbot|facebookexternalhit|Facebot|LinkedInBot|Discordbot|WhatsApp|TelegramBot|SkypeUriPreview|Iframely|Embedly|Quora Link Preview|Applebot|Googlebot|bingbot|DuckDuckBot/i;

export function isLinkPreviewBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return LINK_PREVIEW_BOT_RE.test(userAgent);
}
