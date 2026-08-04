"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import {
  isExternalWikiHref,
  normalizeWikiHref,
} from "@/lib/wiki-links";

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
};

export function WikiMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown components={markdownComponents}>{source}</ReactMarkdown>
  );
}
