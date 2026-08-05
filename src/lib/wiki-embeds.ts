/** Resolve allowlisted video providers to a safe iframe src. */

export type WikiVideoEmbed = {
  provider: "youtube" | "vimeo";
  src: string;
  watchUrl: string;
};

function youtubeEmbedSrc(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
}

function vimeoEmbedSrc(videoId: string): string {
  return `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`;
}

function parseYouTubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{6,}$/.test(v)) return v;

    const parts = url.pathname.split("/").filter(Boolean);
    const marker = parts[0];
    if (
      (marker === "embed" ||
        marker === "shorts" ||
        marker === "live" ||
        marker === "v") &&
      parts[1] &&
      /^[\w-]{6,}$/.test(parts[1])
    ) {
      return parts[1];
    }
  }

  return null;
}

function parseVimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    // player.vimeo.com/video/123 or vimeo.com/123 or vimeo.com/channels/x/123
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]!;
      if (/^\d{6,12}$/.test(part)) return part;
    }
  }

  return null;
}

export function resolveVideoEmbed(rawHref: string): WikiVideoEmbed | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const youtubeId = parseYouTubeId(url);
  if (youtubeId) {
    return {
      provider: "youtube",
      src: youtubeEmbedSrc(youtubeId),
      watchUrl: trimmed,
    };
  }

  const vimeoId = parseVimeoId(url);
  if (vimeoId) {
    return {
      provider: "vimeo",
      src: vimeoEmbedSrc(vimeoId),
      watchUrl: trimmed,
    };
  }

  return null;
}
