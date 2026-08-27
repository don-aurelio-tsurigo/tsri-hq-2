/** Turn bare domains into https://… so they leave localhost. */
export function normalizeWikiHref(raw: string): string {
  const href = raw.trim();
  if (!href) return href;
  if (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("?") ||
    /^(https?:|mailto:|tel:)/i.test(href)
  ) {
    return href;
  }
  if (href.startsWith("//")) {
    return `https:${href}`;
  }
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#].*)?$/i.test(href)) {
    return `https://${href}`;
  }
  return href;
}

function originFromUrl(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Origins that count as “this app” for soft navigation. */
export function getAppOrigins(extraOrigin?: string): Set<string> {
  const origins = new Set<string>();
  const candidates = [
    extraOrigin,
    typeof window !== "undefined" ? window.location.origin : undefined,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
  ];
  for (const raw of candidates) {
    const origin = originFromUrl(raw);
    if (origin) origins.add(origin);
  }
  return origins;
}

/**
 * Returns an in-app href (pathname + search + hash) for soft client navigation,
 * or null when the link should leave the app / open externally.
 *
 * Absolute URLs are only treated as internal when their origin matches this app
 * (never rewrite third-party hosts, including their `/` → `/home` trap).
 */
export function getInternalAppHref(
  href: string,
  appOrigin?: string,
): string | null {
  const normalized = normalizeWikiHref(href);
  if (!normalized || normalized.startsWith("#")) return null;
  if (normalized.startsWith("/") || normalized.startsWith("?")) {
    return normalized;
  }
  if (/^(mailto:|tel:)/i.test(normalized)) return null;
  if (!/^https?:\/\//i.test(normalized)) return null;

  try {
    const url = new URL(normalized);
    const origins = getAppOrigins(appOrigin);
    if (!origins.has(url.origin)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Prefer portable in-app paths over absolute same-app URLs when storing links. */
export function canonicalizeWikiHref(raw: string, appOrigin?: string): string {
  const normalized = normalizeWikiHref(raw);
  return getInternalAppHref(normalized, appOrigin) ?? normalized;
}

export function isExternalWikiHref(href: string, appOrigin?: string): boolean {
  const normalized = normalizeWikiHref(href);
  if (!normalized) return false;
  if (normalized.startsWith("#")) return false;
  if (getInternalAppHref(normalized, appOrigin)) return false;
  return /^(https?:|mailto:|tel:)/i.test(normalized);
}
