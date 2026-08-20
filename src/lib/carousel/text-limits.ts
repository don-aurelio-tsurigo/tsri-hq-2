import type { CarouselFormat } from "@/lib/carousel/format";
import type { Slide } from "@/lib/carousel/types";

export const TEXT_LIMIT_NO_BREAK = 530;
export const TEXT_LIMIT_ONE_BREAK = 450;
export const TEXT_LIMIT_TWO_BREAKS = 300;
export const QUOTE_TEXT_LIMIT = 300;
export const TIPP_ITEM_BODY_LIMIT = 280;
/** Tsüritipp text slides: visible chars excluding tags and 🗓️. */
export const TSUERITIPP_TEXT_LIMIT = 380;
/** Drop role/institution from quote attribution when the full line exceeds this. */
export const ATTRIBUTION_MAX_LENGTH = 43;
/** Sentence-end cut is used only if it falls in [ratio * limit, limit]. */
export const SENTENCE_CUT_MIN_RATIO = 0.7;

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

export function textLimitForParagraphBreaks(breaks: number): number {
  if (breaks <= 0) return TEXT_LIMIT_NO_BREAK;
  if (breaks === 1) return TEXT_LIMIT_ONE_BREAK;
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

function tsueritippVisibleLength(html: string): number {
  return visibleTextLength(
    html.replace(/(?:\u{1F5D3}|\u{1F4C5})\u{FE0F}?|🗓️|📅/gu, ""),
  );
}

export function truncateHtmlToVisibleChars(html: string, limit: number): string {
  if (limit <= 0) return "";
  if (visibleTextLength(html) <= limit) return html;

  const minSentenceVisible = Math.ceil(limit * SENTENCE_CUT_MIN_RATIO);
  let i = 0;
  let visible = 0;
  let lastWordEnd = 0;
  let lastSentenceEnd = 0;
  let inWord = false;

  while (i < html.length) {
    const tag = matchTag(html, i);
    if (tag) {
      if (tag.name === "br") {
        if (inWord && visible <= limit) lastWordEnd = i;
        inWord = false;
        i += tag.raw.length;
        continue;
      }
      i += tag.raw.length;
      continue;
    }

    const ch = html[i] ?? "";
    if (ch === "\n" || ch === "\r") {
      if (inWord && visible <= limit) lastWordEnd = i;
      inWord = false;
      i += 1;
      continue;
    }

    if (/\s/.test(ch)) {
      if (inWord && visible <= limit) lastWordEnd = i;
      inWord = false;
      visible += 1;
      if (visible > limit) break;
      i += 1;
      continue;
    }

    visible += 1;
    if (visible > limit) break;
    inWord = true;
    i += 1;
    if (isSentenceEnd(ch) && visible >= minSentenceVisible) {
      lastSentenceEnd = i;
      inWord = false;
    }
  }

  if (visible <= limit && i >= html.length) return html;
  if (inWord && visible <= limit) lastWordEnd = i;

  const cutAt = lastSentenceEnd > 0 ? lastSentenceEnd : lastWordEnd;
  const cut = closeOpenTags(html.slice(0, cutAt));
  return stripTrailingEmptyMarkup(cut);
}

export function enforceSlideTextLimits(
  slides: Slide[],
  format: CarouselFormat = "standard",
): Slide[] {
  return slides.map((slide) => {
    if (slide.type === "text") {
      const limit =
        format === "tsueritipp"
          ? TSUERITIPP_TEXT_LIMIT
          : textLimitForParagraphBreaks(countParagraphBreaks(slide.bodyHtml));
      const visible =
        format === "tsueritipp"
          ? tsueritippVisibleLength(slide.bodyHtml)
          : visibleTextLength(slide.bodyHtml);
      if (visible <= limit) return slide;
      return {
        ...slide,
        bodyHtml: truncateHtmlToVisibleChars(slide.bodyHtml, limit),
      };
    }
    if (slide.type === "tipp-item") {
      const items = slide.items.map((item) => {
        const body =
          visibleTextLength(item.body) <= TIPP_ITEM_BODY_LIMIT
            ? item.body
            : truncateHtmlToVisibleChars(item.body, TIPP_ITEM_BODY_LIMIT);
        return body === item.body ? item : { ...item, body };
      });
      if (items.every((item, i) => item === slide.items[i])) return slide;
      return { ...slide, items };
    }
    if (slide.type === "quote") {
      const quoteText =
        visibleTextLength(slide.quoteText) <= QUOTE_TEXT_LIMIT
          ? slide.quoteText
          : truncateHtmlToVisibleChars(slide.quoteText, QUOTE_TEXT_LIMIT);
      const attribution = shortenQuoteAttribution(slide.attribution);
      if (quoteText === slide.quoteText && attribution === slide.attribution) {
        return slide;
      }
      return {
        ...slide,
        quoteText,
        attribution,
      };
    }
    return slide;
  });
}

export function shortenQuoteAttribution(attribution: string): string {
  const trimmed = attribution.trim();
  if (!trimmed) return trimmed;
  if (visibleTextLength(trimmed) <= ATTRIBUTION_MAX_LENGTH) return trimmed;

  const comma = trimmed.indexOf(",");
  if (comma < 0) return trimmed;

  const name = trimmed.slice(0, comma).trim();
  if (!name || visibleTextLength(name) > ATTRIBUTION_MAX_LENGTH) return trimmed;
  return name;
}

function isSentenceEnd(ch: string): boolean {
  return ch === "." || ch === "!" || ch === "?";
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
