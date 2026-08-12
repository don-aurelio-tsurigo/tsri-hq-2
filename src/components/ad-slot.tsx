"use client";

import { useEffect, useRef, useState } from "react";

export type AdSlotId = "article-top";

type ServedCreative = {
  creativeId: string;
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  targetUrl: string;
};

type AdSlotProps = {
  /** Reserved for multi-slot later; MVP only serves article-top. */
  slot?: AdSlotId;
  className?: string;
};

function trackEvent(creativeId: string, type: "IMPRESSION" | "CLICK") {
  const payload = JSON.stringify({ creativeId, type });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/ads/event", blob)) return;
    }
  } catch {
    // fall through to fetch
  }
  void fetch("/api/ads/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

function vimeoEmbedSrc(url: string): string {
  // Accept full embed URLs or plain vimeo.com/ID links
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

/**
 * Client ad slot for Direct-Sold creatives.
 * Renders nothing on 204 / error (no layout shift placeholder).
 */
export function AdSlot({ slot = "article-top", className }: AdSlotProps) {
  const [creative, setCreative] = useState<ServedCreative | null>(null);
  const impressed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);

    void (async () => {
      try {
        // slot reserved for future targeting; unused in MVP serve API
        void slot;
        const res = await fetch("/api/ads/serve", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (cancelled || res.status === 204 || !res.ok) return;
        const data = (await res.json()) as ServedCreative;
        if (!data?.creativeId || !data.mediaUrl) return;
        if (!cancelled) setCreative(data);
      } catch {
        // fail open: show nothing
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [slot]);

  useEffect(() => {
    if (!creative || impressed.current) return;
    impressed.current = true;
    trackEvent(creative.creativeId, "IMPRESSION");
  }, [creative]);

  if (!creative) return null;

  return (
    <aside
      className={className}
      data-ad-slot={slot}
      aria-label="Werbung"
      style={{ position: "relative", lineHeight: 0 }}
    >
      {creative.type === "VIDEO" ? (
        <iframe
          src={vimeoEmbedSrc(creative.mediaUrl)}
          title="Werbung"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            border: 0,
            display: "block",
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={creative.mediaUrl}
          alt=""
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      )}
      <a
        href={creative.targetUrl}
        rel="noopener noreferrer sponsored"
        onClick={() => trackEvent(creative.creativeId, "CLICK")}
        aria-label="Zur Anzeige"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      />
    </aside>
  );
}
