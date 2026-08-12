/** Extract a canonical vimeo.com/ID URL for oEmbed. */
export function vimeoPageUrl(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (!match) return null;
  return `https://vimeo.com/${match[1]}`;
}

export function vimeoEmbedSrc(url: string): string {
  if (url.includes("player.vimeo.com")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}autoplay=1&muted=1&loop=1&background=1`;
  }
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (match) {
    return `https://player.vimeo.com/video/${match[1]}?autoplay=1&muted=1&loop=1&background=1`;
  }
  return url;
}

/** Resolve native video aspect ratio via Vimeo oEmbed (falls back to null). */
export async function fetchVimeoAspectRatio(
  url: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const page = vimeoPageUrl(url);
  if (!page) return null;
  try {
    const res = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}`,
      { signal, cache: "force-cache" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { width?: number; height?: number };
    if (
      typeof data.width === "number" &&
      typeof data.height === "number" &&
      data.width > 0 &&
      data.height > 0
    ) {
      return data.width / data.height;
    }
  } catch {
    // ignore network / abort
  }
  return null;
}
