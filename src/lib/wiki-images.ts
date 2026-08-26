import { randomBytes } from "node:crypto";
import sharp from "sharp";

/** Hard isolation from DAM prefixes (staging/, archive/). */
export const WIKI_R2_PREFIX = "wiki/";

export const WIKI_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Longest edge after upload — enough for sharp display, not full-bleed page width. */
export const WIKI_IMAGE_MAX_EDGE = 1200;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isAllowedWikiImageType(contentType: string): boolean {
  return ALLOWED_TYPES.has(contentType.toLowerCase());
}

export function extensionForWikiContentType(contentType: string): string {
  switch (contentType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export function buildWikiImageR2Key(opts: {
  organizationId: string;
  imageId: string;
  contentType: string;
}): string {
  const ext = extensionForWikiContentType(opts.contentType);
  const nonce = randomBytes(4).toString("hex");
  const key = `${WIKI_R2_PREFIX}${opts.organizationId}/${opts.imageId}/${nonce}.${ext}`;
  assertWikiR2Key(key, opts.organizationId);
  return key;
}

export function assertWikiR2Key(key: string, organizationId: string): void {
  if (
    !key.startsWith(`${WIKI_R2_PREFIX}${organizationId}/`) ||
    key.includes("..") ||
    key.startsWith("staging/") ||
    key.startsWith("archive/")
  ) {
    throw new Error("Ungültiger Wiki-R2-Key.");
  }
}

export function wikiImagePublicPath(imageId: string): string {
  return `/api/wiki/images/${encodeURIComponent(imageId)}`;
}

export function parseWikiImageIdFromHref(href: string): string | null {
  try {
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : href.split("?")[0] ?? href;
    const match = path.match(/^\/api\/wiki\/images\/([^/]+)\/?$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

const WIKI_IMAGE_HREF_RE = /\/api\/wiki\/images\/([^/\s)"'\]]+)/g;

/** Collect WikiImage ids referenced in markdown (or HTML). */
export function extractWikiImageIds(content: string): Set<string> {
  const ids = new Set<string>();
  if (!content) return ids;
  for (const match of content.matchAll(WIKI_IMAGE_HREF_RE)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      ids.add(decodeURIComponent(raw));
    } catch {
      ids.add(raw);
    }
  }
  return ids;
}

/** Normalize upload bytes: enforce type, optional downscale (keep GIF as-is). */
export async function prepareWikiImageBytes(
  bytes: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string; width?: number; height?: number }> {
  const type = contentType.toLowerCase();
  if (!isAllowedWikiImageType(type)) {
    throw new Error("Nur JPEG, PNG, WebP oder GIF sind erlaubt.");
  }

  if (type === "image/gif") {
    const image = sharp(bytes, { animated: true, failOn: "none" });
    const meta = await image.metadata();
    const width = meta.width ?? undefined;
    const height = meta.height ?? undefined;
    const needsResize =
      (width != null && width > WIKI_IMAGE_MAX_EDGE) ||
      (height != null && height > WIKI_IMAGE_MAX_EDGE);

    if (!needsResize) {
      return { buffer: bytes, contentType: type, width, height };
    }

    const buffer = await image
      .resize({
        width: WIKI_IMAGE_MAX_EDGE,
        height: WIKI_IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .gif()
      .toBuffer();
    const out = await sharp(buffer, { animated: true }).metadata();
    return {
      buffer,
      contentType: "image/gif",
      width: out.width,
      height: out.height,
    };
  }

  const image = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? undefined;
  const height = meta.height ?? undefined;
  const needsResize =
    (width != null && width > WIKI_IMAGE_MAX_EDGE) ||
    (height != null && height > WIKI_IMAGE_MAX_EDGE);

  let pipeline = image;
  if (needsResize) {
    pipeline = pipeline.resize({
      width: WIKI_IMAGE_MAX_EDGE,
      height: WIKI_IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (type === "image/png") {
    const buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    const out = await sharp(buffer).metadata();
    return {
      buffer,
      contentType: "image/png",
      width: out.width,
      height: out.height,
    };
  }

  if (type === "image/webp") {
    const buffer = await pipeline.webp({ quality: 82 }).toBuffer();
    const out = await sharp(buffer).metadata();
    return {
      buffer,
      contentType: "image/webp",
      width: out.width,
      height: out.height,
    };
  }

  const buffer = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  const out = await sharp(buffer).metadata();
  return {
    buffer,
    contentType: "image/jpeg",
    width: out.width,
    height: out.height,
  };
}
