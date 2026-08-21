import type { CarouselFormat } from "@/lib/carousel/format";
import type { Slide } from "@/lib/carousel/types";

export const TEXT_LIMIT_NO_BREAK = 530;
export const TEXT_LIMIT_ONE_BREAK = 450;
export const TEXT_LIMIT_TWO_BREAKS = 300;
/** Standard text slides with 2+ paragraph breaks: 400–500 chars, 2–3 paragraphs. */
export const TEXT_LIMIT_TWO_BREAKS_STANDARD = 500;
export const QUOTE_TEXT_LIMIT = 300;
export const TIPP_ITEM_BODY_LIMIT = 280;

const TAG_RE = /^<\/?(b|i|br)\s*\/?>/i;

type TagMatch = {
  raw: string;
  name: "b" | "i" | "br";
  closing: boolean;
};

export function countParagraphBreaks(html: string): number {
  const normalized = html
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>(?:\s*<br\s*\/?>)+/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return normalized.match(/\n\n+/g)?.length ?? 0;
}

export function textLimitForParagraphBreaks(
  breaks: number,
  format: CarouselFormat = "standard",
): number {
  if (breaks <= 0) return TEXT_LIMIT_NO_BREAK;
  // Standard targets 400–500 chars with 2–3 paragraphs; 2 paragraphs must
  // not be capped below that band or the model cuts mid-sentence.
  if (breaks === 1) {
    return format === "standard"
      ? TEXT_LIMIT_TWO_BREAKS_STANDARD
      : TEXT_LIMIT_ONE_BREAK;
  }
  if (format === "standard") return TEXT_LIMIT_TWO_BREAKS_STANDARD;
  return TEXT_LIMIT_TWO_BREAKS;
}

export function visibleTextLength(html: string): number {
  let i = 0;
  let visible = 0;
  while (i < html.length) {
    const tag = matchTag(html, i);
    if (tag) {
      i += tag.raw.length;
      continue;
    }
    if (html[i] === "\n" || html[i] === "\r") {
      i += 1;
      continue;
    }
    visible += 1;
    i += 1;
  }
  return visible;
}

function applyTextLimit(
  html: string,
  limitFor: (html: string) => number,
): string {
  const withoutFragment = dropIncompleteTrailingSentence(html);
  const limit = limitFor(withoutFragment);
  return visibleTextLength(withoutFragment) <= limit
    ? withoutFragment
    : truncateHtmlToVisibleChars(withoutFragment, limit);
}

type HtmlScan = {
  index: number;
  visible: number;
  lastSentenceEnd: number;
  endedAtSentence: boolean;
};

function scanHtml(html: string, limit = Number.POSITIVE_INFINITY): HtmlScan {
  let i = 0;
  let visible = 0;
  let lastSentenceEnd = 0;
  let endedAtSentence = false;

  while (i < html.length) {
    const tag = matchTag(html, i);
    if (tag) {
      i += tag.raw.length;
      continue;
    }

    const ch = html[i] ?? "";
    if (ch === "\n" || ch === "\r" || /\s/.test(ch)) {
      visible += ch === "\n" || ch === "\r" ? 0 : 1;
      if (visible > limit) break;
      i += 1;
      continue;
    }

    visible += 1;
    if (visible > limit) break;
    const prev = i > 0 ? html[i - 1] : "";
    i += 1;
    if (isSentenceEnd(ch, prev)) {
      lastSentenceEnd = consumeClosingQuotes(html, i);
      endedAtSentence = true;
    } else if (!isClosingQuote(ch)) {
      endedAtSentence = false;
    }
  }

  return { index: i, visible, lastSentenceEnd, endedAtSentence };
}

function isClosingQuote(ch: string): boolean {
  return ch === "»" || ch === '"' || ch === "”" || ch === "’" || ch === "'";
}

function consumeClosingQuotes(html: string, index: number): number {
  let i = index;
  while (i < html.length) {
    const tag = matchTag(html, i);
    if (tag) {
      if (tag.name === "br") break;
      i += tag.raw.length;
      continue;
    }
    const ch = html[i] ?? "";
    if (isClosingQuote(ch)) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

export function dropIncompleteTrailingSentence(html: string): string {
  const { lastSentenceEnd, endedAtSentence } = scanHtml(html);
  if (endedAtSentence || lastSentenceEnd <= 0) return html;
  return stripTrailingEmptyMarkup(
    closeOpenTags(html.slice(0, lastSentenceEnd)),
  );
}

export function truncateHtmlToVisibleChars(html: string, limit: number): string {
  if (limit <= 0) return "";
  if (visibleTextLength(html) <= limit) {
    return dropIncompleteTrailingSentence(html);
  }

  const { lastSentenceEnd, visible, index } = scanHtml(html, limit);
  if (visible <= limit && index >= html.length) {
    return dropIncompleteTrailingSentence(html);
  }
  // Never cut inside a sentence or word. If no sentence fits, keep the text.
  if (lastSentenceEnd <= 0) return html;

  return stripTrailingEmptyMarkup(
    closeOpenTags(html.slice(0, lastSentenceEnd)),
  );
}

export function enforceSlideTextLimits(
  slides: Slide[],
  format: CarouselFormat = "standard",
): Slide[] {
  if (format === "tsueritipp") return slides;
  return slides.map((slide) => {
    if (slide.type === "text") {
      const bodyHtml = applyTextLimit(slide.bodyHtml, (html) =>
        textLimitForParagraphBreaks(countParagraphBreaks(html), format),
      );
      return bodyHtml === slide.bodyHtml ? slide : { ...slide, bodyHtml };
    }
    if (slide.type === "tipp-item") {
      const items = slide.items.map((item) => {
        const body = applyTextLimit(item.body, () => TIPP_ITEM_BODY_LIMIT);
        return body === item.body ? item : { ...item, body };
      });
      if (items.every((item, i) => item === slide.items[i])) return slide;
      return { ...slide, items };
    }
    if (slide.type === "quote") {
      const quoteText = applyTextLimit(slide.quoteText, () => QUOTE_TEXT_LIMIT);
      return quoteText === slide.quoteText ? slide : { ...slide, quoteText };
    }
    return slide;
  });
}

function isSentenceEnd(ch: string, prev: string): boolean {
  if (ch !== "." && ch !== "!" && ch !== "?") return false;
  // German ordinals ("8. September", "ab 8.") are not sentence ends.
  if (ch === "." && /\d/.test(prev)) return false;
  return true;
}

function matchTag(html: string, index: number): TagMatch | null {
  if (html[index] !== "<") return null;
  const match = TAG_RE.exec(html.slice(index));
  if (!match) return null;
  return {
    raw: match[0],
    name: match[1].toLowerCase() as TagMatch["name"],
    closing: match[0].startsWith("</"),
  };
}

function closeOpenTags(html: string): string {
  const open: Array<"b" | "i"> = [];
  let i = 0;
  while (i < html.length) {
    const tag = matchTag(html, i);
    if (!tag) {
      i += 1;
      continue;
    }
    if (tag.name === "b" || tag.name === "i") {
      if (tag.closing) {
        const idx = open.lastIndexOf(tag.name);
        if (idx >= 0) open.splice(idx, 1);
      } else {
        open.push(tag.name);
      }
    }
    i += tag.raw.length;
  }
  return `${html}${open
    .slice()
    .reverse()
    .map((name) => `</${name}>`)
    .join("")}`;
}

function stripTrailingEmptyMarkup(html: string): string {
  return html
    .replace(/(?:<(?:b|i)>\s*<\/(?:b|i)>)+$/gi, "")
    .replace(/(?:<br\s*\/?>|\s)+$/gi, "")
    .trimEnd();
}
