/** Custom domain; login links and session cookies must use this, not *.onrender.com. */
export const CANONICAL_PRODUCTION_ORIGIN = "https://tsri-hub.online";

export function getPublicAppOrigin(): string {
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!raw) return "http://localhost:3000";
  try {
    if (new URL(raw).host.endsWith(".onrender.com")) {
      return CANONICAL_PRODUCTION_ORIGIN;
    }
  } catch {
    /* ignore invalid env */
  }
  return raw;
}

/** Rewrite Better Auth URLs so emails never send people to the Render hostname. */
export function toPublicAppUrl(url: string): string {
  const origin = getPublicAppOrigin();
  try {
    const parsed = new URL(url);
    const dest = new URL(origin);
    parsed.protocol = dest.protocol;
    parsed.host = dest.host;
    return parsed.toString();
  } catch {
    return url;
  }
}
