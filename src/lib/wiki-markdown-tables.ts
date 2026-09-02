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

/**
 * TipTap wraps every cell in <p>. Those block paragraphs make turndown emit
 * newlines inside cells, which shatters GFM table rows into bare "| |" lines.
 * Flatten cells to inline content first.
 */
export function flattenTipTapTableCells(html: string): string {
  if (!html.includes("<table")) return html;
  return html.replace(
    /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_full, tag: string, attrs: string, inner: string) => {
      const paragraphs = [
        ...inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi),
      ].map((match) => match[1] ?? "");

      let content: string;
      if (paragraphs.length > 0) {
        content = paragraphs
          .map((paragraph) =>
            paragraph
              .replace(/<br\b[^>]*\/?>/gi, "<br>")
              .replace(/\n+/g, " ")
              .trim(),
          )
          .filter((paragraph) => cellText(paragraph) !== "")
          .join("<br>");
      } else {
        content = inner.replace(/\n+/g, " ").trim();
      }

      return `<${tag}${attrs}>${content}</${tag}>`;
    },
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
