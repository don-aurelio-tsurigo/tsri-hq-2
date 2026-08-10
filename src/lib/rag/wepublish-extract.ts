/**
 * WePublish article → plain-text chunks for RAG indexing.
 * Ported from RAG_Import/scripts/wepublish-export.ts (same chunk rules).
 */

const TARGET_CHUNK_WORDS = 400;
const CHUNK_OVERLAP_WORDS = 50;
const MIGRATION_BOILERPLATE_RE =
  /automatisch in das neue CMS von Tsri\.ch migriert/i;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type WepublishApiBlock = {
  __typename?: string;
  richText?: Json;
  quote?: string | null;
  author?: string | null;
  caption?: string | null;
};

export type WepublishApiArticle = {
  id: string;
  slug?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  tags?: Array<{ tag?: string | null } | null> | null;
  published?: {
    title?: string | null;
    lead?: string | null;
    authors?: Array<{ name?: string | null } | null> | null;
    image?: { url?: string | null } | null;
    blocks?: WepublishApiBlock[] | null;
  } | null;
};

export type ExtractedRagArticle = {
  wepublishId: string;
  slug: string | null;
  url: string | null;
  title: string | null;
  lead: string | null;
  publishedAt: string | null;
  authors: string[];
  tags: string[];
  imageUrl: string | null;
  rawWordCount: number;
  chunks: string[];
};

type ContentUnit =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string };

type ContentPiece =
  | { kind: "section"; text: string }
  | { kind: "caption"; text: string };

function wordCount(text: string): number {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return 0;
  return t.split(" ").filter(Boolean).length;
}

function wordsOf(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function nodeText(node: Json): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object") {
    const obj = node as Record<string, Json>;
    if (typeof obj.text === "string") return obj.text;
    if (obj.content) return nodeText(obj.content);
  }
  return "";
}

function richTextToUnits(richText: Json): ContentUnit[] {
  const units: ContentUnit[] = [];
  if (!richText || typeof richText !== "object" || Array.isArray(richText)) {
    return units;
  }
  const doc = richText as Record<string, Json>;
  const content = Array.isArray(doc.content) ? doc.content : [];

  for (const raw of content) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const node = raw as Record<string, Json>;
    const type = typeof node.type === "string" ? node.type : "";
    const text = nodeText(node.content ?? node).replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (MIGRATION_BOILERPLATE_RE.test(text)) continue;

    if (type === "heading") {
      units.push({ kind: "heading", text });
    } else {
      units.push({ kind: "paragraph", text });
    }
  }
  return units;
}

function extractFromBlocks(blocks: WepublishApiBlock[]): ContentPiece[] {
  const pieces: ContentPiece[] = [];
  let current: string[] = [];

  const flushSection = () => {
    const text = current.join("\n\n").trim();
    if (text) pieces.push({ kind: "section", text });
    current = [];
  };

  for (const block of blocks) {
    const type = block.__typename ?? "(unknown)";

    if (type === "RichTextBlock") {
      const units = richTextToUnits(block.richText ?? null);
      for (const unit of units) {
        if (unit.kind === "heading") {
          flushSection();
          current.push(unit.text);
        } else {
          current.push(unit.text);
        }
      }
      continue;
    }

    if (type === "QuoteBlock") {
      if (block.author === "__html") continue;
      const quote = (block.quote ?? "").replace(/\s+/g, " ").trim();
      if (!quote) continue;
      const author = (block.author ?? "").replace(/\s+/g, " ").trim();
      current.push(author ? `${quote}\n— ${author}` : quote);
      continue;
    }

    if (type === "ImageBlock") {
      const caption = (block.caption ?? "").replace(/\s+/g, " ").trim();
      if (caption) {
        flushSection();
        pieces.push({ kind: "caption", text: caption });
      }
    }
  }

  flushSection();
  return pieces;
}

function chunkSection(
  text: string,
  targetWords = TARGET_CHUNK_WORDS,
  overlapWords = CHUNK_OVERLAP_WORDS,
): string[] {
  const words = wordsOf(text);
  if (words.length === 0) return [];
  if (words.length <= targetWords) return [words.join(" ")];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + targetWords, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start = Math.max(0, end - overlapWords);
    if (start >= end) start = end;
  }
  return chunks;
}

function buildChunks(pieces: ContentPiece[]): string[] {
  const chunks: string[] = [];
  for (const piece of pieces) {
    if (piece.kind === "caption") {
      const t = piece.text.trim();
      if (t) chunks.push(t);
      continue;
    }
    chunks.push(...chunkSection(piece.text));
  }
  return chunks;
}

export function extractRagArticle(
  node: WepublishApiArticle,
): ExtractedRagArticle | null {
  const published = node.published;
  if (!published) return null;

  const pieces = extractFromBlocks(published.blocks ?? []);
  const chunks = buildChunks(pieces);
  const fullText = pieces
    .map((p) => p.text)
    .join("\n\n")
    .trim();

  return {
    wepublishId: node.id,
    slug: node.slug ?? null,
    url: node.url ?? null,
    title: published.title ?? null,
    lead: published.lead ?? null,
    publishedAt: node.publishedAt ?? null,
    authors: (published.authors ?? [])
      .map((a) => (a?.name ?? "").trim())
      .filter(Boolean),
    tags: (node.tags ?? [])
      .map((t) => (t?.tag ?? "").trim())
      .filter(Boolean),
    imageUrl: published.image?.url ?? null,
    rawWordCount: wordCount(fullText),
    chunks,
  };
}

export function chunkWordCount(text: string): number {
  return wordCount(text);
}
