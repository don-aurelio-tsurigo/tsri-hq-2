import { wepublishGraphql, WepublishApiError } from "@/lib/wepublish/client";

const ALLOWED_HOSTS = new Set(["tsri.ch", "www.tsri.ch"]);

export type FetchedArticle = {
  id: string;
  slug: string;
  url: string | null;
  title: string;
  preTitle: string | null;
  lead: string | null;
  authors: string[];
  tags: string[];
  imageUrl: string | null;
  bodyText: string;
};

type RichTextNode = {
  text?: string;
  type?: string;
  content?: RichTextNode[];
  children?: RichTextNode[];
};

type ArticleBlock = {
  __typename?: string;
  preTitle?: string | null;
  title?: string | null;
  lead?: string | null;
  quote?: string | null;
  author?: string | null;
  text?: string | null;
  html?: string | null;
  richText?: unknown;
  items?: Array<{
    title?: string | null;
    richText?: unknown;
  }> | null;
};

type ArticleQueryData = {
  article: {
    id: string;
    slug: string;
    url?: string | null;
    tags?: Array<{ tag?: string | null } | null> | null;
    latest?: {
      preTitle?: string | null;
      title?: string | null;
      lead?: string | null;
      authors?: Array<{ name?: string | null } | null> | null;
      image?: {
        url?: string | null;
        l?: string | null;
      } | null;
      blocks?: ArticleBlock[] | null;
    } | null;
  } | null;
};

const ARTICLE_QUERY = `
query ArticleForCarousel($slug: String) {
  article(slug: $slug) {
    id
    slug
    url
    tags {
      tag
    }
    latest {
      preTitle
      title
      lead
      authors {
        name
      }
      image {
        url
        l: transformURL(input: { width: 1200 })
      }
      blocks {
        __typename
        ... on TitleBlock {
          preTitle
          title
          lead
        }
        ... on RichTextBlock {
          richText
        }
        ... on QuoteBlock {
          quote
          author
        }
        ... on BreakBlock {
          text
          richText
        }
        ... on ListicleBlock {
          items {
            title
            richText
          }
        }
        ... on HTMLBlock {
          html
        }
      }
    }
  }
}
`;

export function parseTsriArticleUrl(input: string): { slug: string; url: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new WepublishApiError("Bitte eine Artikel-URL einfügen.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new WepublishApiError("Ungültige URL.");
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new WepublishApiError(
      "Nur Artikel von tsri.ch können importiert werden.",
    );
  }

  const match = parsed.pathname.match(/^\/a\/([^/?#]+)\/?$/i);
  if (!match?.[1]) {
    throw new WepublishApiError(
      "URL muss dem Format https://tsri.ch/a/artikel-slug entsprechen.",
    );
  }

  const slug = decodeURIComponent(match[1]);
  return { slug, url: `https://tsri.ch/a/${slug}` };
}

function richTextToPlain(nodes: unknown): string {
  if (!nodes) return "";
  if (typeof nodes === "string") return nodes;
  if (Array.isArray(nodes)) {
    return nodes
      .map((node) => richTextToPlain(node))
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (typeof nodes !== "object") return "";

  const node = nodes as RichTextNode;
  if (typeof node.text === "string") {
    return node.text;
  }

  const childNodes = Array.isArray(node.content)
    ? node.content
    : Array.isArray(node.children)
      ? node.children
      : null;
  if (!childNodes) return "";

  const joined = childNodes.map((child) => richTextToPlain(child)).join("");
  const blockTypes = new Set([
    "paragraph",
    "heading",
    "blockquote",
    "list_item",
    "listItem",
    "hard_break",
    "hardBreak",
  ]);
  if (node.type && blockTypes.has(node.type)) {
    return `${joined}\n`;
  }
  return joined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function blocksToPlaintext(blocks: ArticleBlock[] | null | undefined): string {
  if (!blocks?.length) return "";
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.__typename) {
      case "TitleBlock": {
        const chunk = [block.preTitle, block.title, block.lead]
          .filter(Boolean)
          .join("\n");
        if (chunk) parts.push(chunk);
        break;
      }
      case "RichTextBlock": {
        const text = richTextToPlain(block.richText);
        if (text) parts.push(text);
        break;
      }
      case "QuoteBlock": {
        const quote = [block.quote, block.author ? `— ${block.author}` : null]
          .filter(Boolean)
          .join("\n");
        if (quote) parts.push(quote);
        break;
      }
      case "BreakBlock": {
        const text =
          block.text?.trim() || richTextToPlain(block.richText);
        if (text) parts.push(text);
        break;
      }
      case "ListicleBlock": {
        for (const item of block.items ?? []) {
          const title = item.title?.trim();
          const body = richTextToPlain(item.richText);
          const chunk = [title, body].filter(Boolean).join("\n");
          if (chunk) parts.push(chunk);
        }
        break;
      }
      case "HTMLBlock": {
        if (block.html) {
          const text = stripHtml(block.html);
          if (text) parts.push(text);
        }
        break;
      }
      default:
        break;
    }
  }

  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function fetchTsriArticleByUrl(
  inputUrl: string,
): Promise<FetchedArticle> {
  const { slug } = parseTsriArticleUrl(inputUrl);
  const data = await wepublishGraphql<ArticleQueryData>(ARTICLE_QUERY, {
    slug,
  });

  const article = data.article;
  const latest = article?.latest;
  if (!article || !latest?.title) {
    throw new WepublishApiError("Artikel nicht gefunden oder nicht veröffentlicht.");
  }

  const bodyText = blocksToPlaintext(latest.blocks);
  const lead = latest.lead?.trim() || null;
  if (!lead && !bodyText) {
    throw new WepublishApiError(
      "Artikel hat keinen lesbaren Text (evtl. Paywall oder leere Blocks).",
    );
  }

  return {
    id: article.id,
    slug: article.slug,
    url: article.url ?? `https://tsri.ch/a/${slug}`,
    title: latest.title.trim(),
    preTitle: latest.preTitle?.trim() || null,
    lead,
    authors: (latest.authors ?? [])
      .map((a) => a?.name?.trim())
      .filter((name): name is string => Boolean(name)),
    tags: (article.tags ?? [])
      .map((t) => t?.tag?.trim())
      .filter((tag): tag is string => Boolean(tag)),
    imageUrl: latest.image?.l || latest.image?.url || null,
    bodyText,
  };
}
