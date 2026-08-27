import TurndownService from "turndown";
import { tables as turndownTables } from "turndown-plugin-gfm";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.use(turndownTables);
turndown.addRule("tableCellParagraph", {
  filter(node) {
    return (
      node.nodeName === "P" &&
      !!node.parentNode &&
      (node.parentNode.nodeName === "TD" || node.parentNode.nodeName === "TH")
    );
  },
  replacement(content) {
    return content;
  },
});

/**
 * TipTap tables include <colgroup> + width styles; turndown-plugin-gfm then
 * fails to recognize them and leaves raw HTML. Strip chrome first.
 */
export function sanitizeTablesForMarkdown(html: string): string {
  if (!html.includes("<table")) return html;
  return html
    .replace(/<colgroup\b[^>]*>[\s\S]*?<\/colgroup>/gi, "")
    .replace(/<\/?col\b[^>]*\/?>/gi, "")
    .replace(/\s(?:style|colspan|rowspan)="[^"]*"/gi, "")
    .replace(/\s(?:style|colspan|rowspan)='[^']*'/gi, "");
}

export function htmlToWikiMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";
  return turndown.turndown(sanitizeTablesForMarkdown(html)).trim();
}

const HTML_TABLE_RE = /<table\b[^>]*>[\s\S]*?<\/table>/gi;

/** Convert leftover HTML tables in stored bodies to GFM for react-markdown. */
export function normalizeWikiMarkdownTables(source: string): string {
  if (!source || !source.includes("<table")) return source;
  return source.replace(HTML_TABLE_RE, (tableHtml) => {
    try {
      const md = htmlToWikiMarkdown(tableHtml);
      return md || tableHtml;
    } catch {
      return tableHtml;
    }
  });
}
