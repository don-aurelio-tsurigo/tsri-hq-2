"use client";

import { useEffect, useRef, useState } from "react";
import { fetchVimeoAspectRatio, vimeoEmbedSrc } from "@/lib/ads-vimeo";

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

/**
 * Client ad slot for Direct-Sold creatives.
 * Chrome matches tsüri.ch in-content ads (gray frame + „Anzeige“ label).
 * Renders nothing on 204 / error (no layout shift placeholder).
 */
export function AdSlot({ slot = "article-top", className }: AdSlotProps) {
  const [creative, setCreative] = useState<ServedCreative | null>(null);
  const [ready, setReady] = useState(false);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const impressed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);

    void (async () => {
      try {
        void slot;
        const res = await fetch("/api/ads/serve", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (cancelled || res.status === 204 || !res.ok) return;
        const data = (await res.json()) as ServedCreative;
        if (!data?.creativeId || !data.mediaUrl) return;
        if (!cancelled) {
          setVideoAspect(null);
          setCreative(data);
        }
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
    if (!creative || creative.type !== "VIDEO") return;
    let cancelled = false;
    const controller = new AbortController();
    void fetchVimeoAspectRatio(creative.mediaUrl, controller.signal).then(
      (ratio) => {
        if (!cancelled && ratio) setVideoAspect(ratio);
      },
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [creative]);

  useEffect(() => {
    if (!creative || impressed.current) return;
    impressed.current = true;
    trackEvent(creative.creativeId, "IMPRESSION");
    const id = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(id);
  }, [creative]);

  if (!creative) return null;

  return (
    <aside
      className={["hq-ad-slot", ready ? "hq-ad-slot--ready" : "", className]
        .filter(Boolean)
        .join(" ")}
      data-ad-slot={slot}
      aria-label="Anzeige"
    >
      <div className="hq-ad-slot__wrapper">
        <a
          className="hq-ad-slot__label"
          href="https://tsri.ch/werben"
          target="_blank"
          rel="noopener noreferrer"
        >
          Anzeige
        </a>
        <div className="hq-ad-slot__content">
          {creative.type === "VIDEO" ? (
            <iframe
              src={vimeoEmbedSrc(creative.mediaUrl)}
              title="Anzeige"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="hq-ad-slot__media hq-ad-slot__media--video"
              style={{
                aspectRatio: String(videoAspect ?? 16 / 9),
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creative.mediaUrl}
              alt=""
              className="hq-ad-slot__media"
            />
          )}
          <a
            href={creative.targetUrl}
            rel="noopener noreferrer sponsored"
            onClick={() => trackEvent(creative.creativeId, "CLICK")}
            aria-label="Zur Anzeige"
            className="hq-ad-slot__hit"
          />
        </div>
      </div>
    </aside>
  );
}
