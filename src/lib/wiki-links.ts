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

const APP_PATH_ROOTS = new Set([
  "ads",
  "carousel",
  "dam",
  "home",
  "hours",
  "inbox",
  "me",
  "newsletter",
  "payrexx",
  "programm",
  "projects",
  "settings",
  "spaces",
  "tasks",
]);

function isLikelyAppPathname(pathname: string): boolean {
  if (pathname === "/") return true;
  const root = pathname.split("/").filter(Boolean)[0];
  return !!root && APP_PATH_ROOTS.has(root);
}

/**
 * Returns an in-app href (pathname + search + hash) for soft client navigation,
 * or null when the link should leave the app / open externally.
 */
export function getInternalAppHref(href: string): string | null {
  const normalized = normalizeWikiHref(href);
  if (!normalized || normalized.startsWith("#")) return null;
  if (normalized.startsWith("/") || normalized.startsWith("?")) {
    return normalized;
  }
  if (/^(mailto:|tel:)/i.test(normalized)) return null;
  if (!/^https?:\/\//i.test(normalized)) return null;

  try {
    const url = new URL(normalized);
    if (!isLikelyAppPathname(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Prefer portable in-app paths over absolute same-app URLs when storing links. */
export function canonicalizeWikiHref(raw: string): string {
  const normalized = normalizeWikiHref(raw);
  return getInternalAppHref(normalized) ?? normalized;
}

export function isExternalWikiHref(href: string): boolean {
  const normalized = normalizeWikiHref(href);
  if (!normalized) return false;
  if (normalized.startsWith("#")) return false;
  if (getInternalAppHref(normalized)) return false;
  return /^(https?:|mailto:|tel:)/i.test(normalized);
}
