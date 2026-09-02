import TurndownService from "turndown";
import { tables as turndownTables } from "turndown-plugin-gfm";

function isInsideTableCell(node: Node): boolean {
  let current: Node | null = node.parentNode;
  while (current) {
    if (current.nodeName === "TD" || current.nodeName === "TH") return true;
    current = current.parentNode;
  }
  return false;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.use(turndownTables);

// Keep <br> inside cells — turndown's default "  \n" breaks GFM rows.
turndown.addRule("tableCellBreak", {
  filter(node) {
    return node.nodeName === "BR" && isInsideTableCell(node);
  },
  replacement() {
    return "<br>";
  },
});

function cellText(innerHtml: string): string {
  return innerHtml
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function stripEmptyParagraphsOutsideTables(html: string): string {
  const parts = html.split(/(<table[\s\S]*?<\/table>)/gi);
  return parts
    .map((part) => {
      if (/^<table/i.test(part)) return part;
      return part.replace(/<p\b[^>]*>(?:\s|<br[^>]*\/?>)*<\/p>/gi, "");
    })
    .join("");
}

/** Inline-safe cell fragment: keep formatting tags, drop block wrappers/newlines. */
function stripCellBlockWrappers(html: string): string {
  return html
    .replace(/<br\b[^>]*\/?>/gi, "<br>")
    .replace(
      /<\/?(?:p|div|li|ul|ol|blockquote|h[1-6]|section)\b[^>]*>/gi,
      "",
    )
    .replace(/\n+/g, " ")
    .trim();
}

function flattenListItems(listInner: string): string[] {
  return [...listInner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => stripCellBlockWrappers(match[1] ?? ""))
    .filter((item) => cellText(item) !== "");
}

/**
 * Collapse TipTap cell HTML (paragraphs, lists, hard breaks) into a single
 * inline fragment. Block newlines inside cells shatter GFM table rows.
 */
export function flattenCellContent(inner: string): string {
  let content = inner;

  // Nested lists first (innermost match via repetition).
  for (let pass = 0; pass < 6; pass += 1) {
    const next = content
      .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_m, listInner: string) =>
        flattenListItems(listInner)
          .map((item) => `• ${item}`)
          .join("<br>"),
      )
      .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_m, listInner: string) =>
        flattenListItems(listInner)
          .map((item, index) => `${index + 1}. ${item}`)
          .join("<br>"),
      );
    if (next === content) break;
    content = next;
  }

  if (/<p\b/i.test(content)) {
    content = content.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, paragraph: string) => {
      const text = stripCellBlockWrappers(paragraph);
      return cellText(text) !== "" ? `${text}<br>` : "";
    });
  }

  content = stripCellBlockWrappers(content)
    .replace(/(?:<br>\s*)+/g, "<br>")
    .replace(/^<br>|<br>$/g, "")
    .trim();

  return content;
}

/**
 * TipTap wraps every cell in <p> and may nest lists. Those blocks make
 * turndown emit newlines inside cells, which shatters GFM table rows.
 */
export function flattenTipTapTableCells(html: string): string {
  if (!html.includes("<table")) return html;
  return html.replace(
    /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_full, tag: string, attrs: string, inner: string) =>
      `<${tag}${attrs}>${flattenCellContent(inner)}</${tag}>`,
  );
}

/** Drop empty TipTap paragraphs and table rows before markdown conversion. */
export function stripEmptyWikiBlocks(html: string): string {
  if (!html) return html;

  let out = stripEmptyParagraphsOutsideTables(html);

  const rowMatches = [...out.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const rowInfos = rowMatches.map((match) => {
    const inner = match[1] ?? "";
    const cells = [...inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    const hasContent = cells.some((cell) => cellText(cell[1] ?? "") !== "");
    return { full: match[0], hasContent };
  });
  const contentRowCount = rowInfos.filter((row) => row.hasContent).length;

  // Keep all rows when the table is entirely empty (e.g. freshly inserted TipTap
  // tables) so turndown-plugin-gfm does not crash on a table with zero <tr>.
  if (contentRowCount > 0) {
    const kept = new Set(
      rowInfos.filter((row) => row.hasContent).map((row) => row.full),
    );
    out = out.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (row) =>
      kept.has(row) ? row : "",
    );
  }

  return out;
}

/**
 * TipTap tables include <colgroup> + width styles; turndown-plugin-gfm then
 * fails to recognize them and leaves raw HTML. Strip chrome first.
 */
export function sanitizeTablesForMarkdown(html: string): string {
  if (!html.includes("<table")) return html;
  return flattenTipTapTableCells(
    html
      .replace(/<colgroup\b[^>]*>[\s\S]*?<\/colgroup>/gi, "")
      .replace(/<\/?col\b[^>]*\/?>/gi, "")
      .replace(/\s(?:style|colspan|rowspan)="[^"]*"/gi, "")
      .replace(/\s(?:style|colspan|rowspan)='[^']*'/gi, ""),
  );
}

export function htmlToWikiMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";
  const cleaned = stripEmptyWikiBlocks(sanitizeTablesForMarkdown(html));
  if (!cleaned || cleaned === "<p></p>") return "";
  const md = turndown.turndown(cleaned);
  return md
    .replace(/^\u00a0$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HTML_TABLE_RE = /<table\b[^>]*>[\s\S]*?<\/table>/gi;

/** Convert leftover HTML tables in stored bodies to GFM for react-markdown. */
export function normalizeWikiMarkdownTables(source: string): string {
  if (!source || !source.includes("<table")) return source;
  return source.replace(HTML_TABLE_RE, (tableHtml) => {
    try {
      const md = htmlToWikiMarkdown(tableHtml);
      return md ? `\n\n${md}\n\n` : "";
    } catch {
      return tableHtml;
    }
  });
}

/** Normalize stored wiki markdown (legacy HTML tables, nbsp spacers). */
export function normalizeWikiMarkdown(source: string): string {
  if (!source) return source;
  return normalizeWikiMarkdownTables(source)
    .replace(/^\u00a0$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
