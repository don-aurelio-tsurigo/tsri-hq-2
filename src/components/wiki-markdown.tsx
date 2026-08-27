"use client";

import {
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveVideoEmbed } from "@/lib/wiki-embeds";
import type { WikiVideoProvider } from "@/lib/wiki-embeds";
import {
  getInternalAppHref,
  isExternalWikiHref,
  normalizeWikiHref,
} from "@/lib/wiki-links";
import { normalizeWikiMarkdownTables } from "@/lib/wiki-markdown-tables";

function WikiVideoEmbed({
  src,
  watchUrl,
  provider,
}: {
  src: string;
  watchUrl: string;
  provider: WikiVideoProvider;
}) {
  const label =
    provider === "youtube"
      ? "YouTube-Video"
      : provider === "vimeo"
        ? "Vimeo-Video"
        : "Loom-Video";
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

function WikiAnchor({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  const raw = typeof href === "string" ? href : "";
  const normalized = normalizeWikiHref(raw);
  const internal = getInternalAppHref(normalized);

  if (internal) {
    return (
      <Link href={internal} prefetch={false}>
        {children}
      </Link>
    );
  }

  if (normalized.startsWith("#")) {
    return <a href={normalized}>{children}</a>;
  }

  if (isExternalWikiHref(normalized)) {
    return (
      <a href={normalized} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }

  return <a href={normalized || undefined}>{children}</a>;
}

const markdownComponents: Components = {
  a({ href, children }) {
    return <WikiAnchor href={href}>{children}</WikiAnchor>;
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
    return (
      <img
        src={raw}
        alt={typeof alt === "string" ? alt : ""}
        loading="lazy"
        className="wiki-content-image"
      />
    );
  },
  table({ children, ...props }) {
    return (
      <div className="wiki-table-wrap">
        <table className="wiki-table" {...props}>
          {children}
        </table>
      </div>
    );
  },
};

export function WikiMarkdown({ source }: { source: string }) {
  const normalized = normalizeWikiMarkdownTables(source);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {normalized}
    </ReactMarkdown>
  );
}
