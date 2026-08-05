"use client";

import {
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { resolveVideoEmbed } from "@/lib/wiki-embeds";
import {
  isExternalWikiHref,
  normalizeWikiHref,
} from "@/lib/wiki-links";

function WikiVideoEmbed({
  src,
  watchUrl,
  provider,
}: {
  src: string;
  watchUrl: string;
  provider: "youtube" | "vimeo";
}) {
  const label = provider === "youtube" ? "YouTube-Video" : "Vimeo-Video";
  return (
    <figure className="wiki-video-embed my-4">
      <div className="wiki-video-embed__frame">
        <iframe
          src={src}
          title={label}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <figcaption className="mt-1.5 text-xs text-[var(--muted)]">
        <a href={watchUrl} target="_blank" rel="noopener noreferrer">
          {label} öffnen
        </a>
      </figcaption>
    </figure>
  );
}

function soleAnchorHref(children: ReactNode): string | null {
  const items = Children.toArray(children).filter((child) => {
    if (typeof child === "string") return child.trim().length > 0;
    return true;
  });
  if (items.length !== 1) return null;
  const only = items[0];
  if (!isValidElement<{ href?: string }>(only)) return null;
  return typeof only.props.href === "string" ? only.props.href : null;
}

const markdownComponents: Components = {
  a({ href, children, ...props }) {
    const raw = typeof href === "string" ? href : "";
    const normalized = normalizeWikiHref(raw);
    const external = isExternalWikiHref(normalized);

    if (external) {
      return (
        <a
          {...props}
          href={normalized}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    }

    return (
      <a {...props} href={normalized || undefined}>
        {children}
      </a>
    );
  },
  p({ children, ...props }) {
    const href = soleAnchorHref(children);
    if (href) {
      const embed = resolveVideoEmbed(normalizeWikiHref(href));
      if (embed) {
        return (
          <WikiVideoEmbed
            src={embed.src}
            watchUrl={embed.watchUrl}
            provider={embed.provider}
          />
        );
      }
    }
    return <p {...props}>{children}</p>;
  },
  img({ src, alt }) {
    const raw = typeof src === "string" ? src : "";
    const embed = resolveVideoEmbed(normalizeWikiHref(raw));
    if (embed) {
      return (
        <WikiVideoEmbed
          src={embed.src}
          watchUrl={embed.watchUrl}
          provider={embed.provider}
        />
      );
    }
    if (!raw) return null;
    return <img src={raw} alt={typeof alt === "string" ? alt : ""} />;
  },
};

export function WikiMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown components={markdownComponents}>{source}</ReactMarkdown>
  );
}
