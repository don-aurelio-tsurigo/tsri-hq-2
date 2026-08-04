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

export function isExternalWikiHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href);
}
