import TurndownService from "turndown";
import { tables as turndownTables } from "turndown-plugin-gfm";

const SPACER = "\u00a0"; // non-breaking space — keeps an empty markdown paragraph

function isTableCell(node: HTMLElement): boolean {
  const parent = node.parentNode;
  return (
    !!parent && (parent.nodeName === "TD" || parent.nodeName === "TH")
  );
}

function paragraphText(node: HTMLElement): string {
  return (node.textContent || "").replace(/\u00a0/g, " ").trim();
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  blankReplacement: (_content, node) => {
    // Keep intentional empty paragraphs from TipTap as visible spacers.
    if (node.nodeName === "P" && !isTableCell(node)) {
      return `\n\n${SPACER}\n\n`;
    }
    const block = (node as HTMLElement & { isBlock?: boolean }).isBlock;
    return block ? "\n\n" : "";
  },
});
turndown.use(turndownTables);

turndown.addRule("emptyParagraph", {
  filter(node) {
    return (
      node.nodeName === "P" &&
      !isTableCell(node) &&
      paragraphText(node) === ""
    );
  },
  replacement() {
    return `\n\n${SPACER}\n\n`;
  },
});

// TipTap wraps every cell in <p>; GFM cells are inline — join with <br>.
turndown.addRule("tableCellParagraph", {
  filter(node) {
    return node.nodeName === "P" && isTableCell(node);
  },
  replacement(content, node) {
    const text = content.replace(/\n+/g, " ").trim();
    if (!text) return "";
    const parent = node.parentNode;
    if (!parent) return text;
    const siblings = Array.from(parent.childNodes).filter(
      (child) => child.nodeName === "P",
    );
    const index = siblings.indexOf(node);
    const isLast = index === siblings.length - 1;
    return isLast ? text : `${text}<br>`;
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
  if (!html || html === "<p></p>" || html === `<p>${SPACER}</p>`) return "";
  const md = turndown.turndown(sanitizeTablesForMarkdown(html));
  return md
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HTML_TABLE_RE = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
const HTML_PARAGRAPH_RE = /<p\b[^>]*>[\s\S]*?<\/p>/gi;

/** Convert leftover HTML tables in stored bodies to GFM for react-markdown. */
export function normalizeWikiMarkdownTables(source: string): string {
  if (!source || !source.includes("<table")) return source;
  return source.replace(HTML_TABLE_RE, (tableHtml) => {
    try {
      const md = htmlToWikiMarkdown(tableHtml);
      return md ? `\n\n${md}\n\n` : tableHtml;
    } catch {
      return tableHtml;
    }
  });
}

/** Convert leftover HTML <p>…</p> (and tables) so view mode matches the editor. */
export function normalizeWikiMarkdown(source: string): string {
  if (!source) return source;
  let out = normalizeWikiMarkdownTables(source);
  if (!out.includes("<p")) {
    return out.replace(/\n{3,}/g, "\n\n").trim();
  }
  out = out.replace(HTML_PARAGRAPH_RE, (paragraphHtml) => {
    try {
      const md = htmlToWikiMarkdown(paragraphHtml);
      return md ? `\n\n${md}\n\n` : `\n\n${SPACER}\n\n`;
    } catch {
      return paragraphHtml;
    }
  });
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
