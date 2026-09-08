import type { DamRightsType } from "@/lib/dam/types";
import { DAM_RIGHTS_HINTS, DAM_RIGHTS_LABELS } from "@/lib/dam/types";

/** Editorial fields embedded into export / WePublish JPEGs (EXIF + XMP). */
export type DamExportEditorial = {
  credit?: string | null;
  altText?: string | null;
  keywords?: string[] | null;
  notes?: string | null;
  rightsType?: DamRightsType | string | null;
  takenAt?: Date | string | null;
};

export type DamExportMetadataPayload = {
  exif?: {
    IFD0?: Record<string, string>;
    IFD2?: Record<string, string>;
  };
  xmp?: string;
};

function trimText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;
  return trimmed;
}

function uniqueKeywords(keywords: string[] | null | undefined): string[] {
  if (!Array.isArray(keywords)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    if (typeof raw !== "string") continue;
    const keyword = raw.trim();
    if (!keyword) continue;
    const key = keyword.toLocaleLowerCase("de-CH");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** EXIF DateTimeOriginal / DateTime: `YYYY:MM:DD HH:mm:ss` in UTC. */
export function formatExifDateTime(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    `${date.getUTCFullYear()}:${pad(date.getUTCMonth() + 1)}:${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`,
  ].join(" ");
}

function rightsHint(rightsType: string | null | undefined): string | null {
  if (rightsType === "own" || rightsType === "provided" || rightsType === "free_use") {
    return DAM_RIGHTS_HINTS[rightsType];
  }
  return null;
}

function rightsLabel(rightsType: string | null | undefined): string | null {
  if (rightsType === "own" || rightsType === "provided" || rightsType === "free_use") {
    return DAM_RIGHTS_LABELS[rightsType];
  }
  return null;
}

function buildXmp(opts: {
  credit: string | null;
  altText: string | null;
  notes: string | null;
  keywords: string[];
  rightsType: string | null;
}): string | undefined {
  const { credit, altText, notes, keywords } = opts;
  const usage = rightsHint(opts.rightsType);
  const label = rightsLabel(opts.rightsType);
  if (!credit && !altText && !notes && keywords.length === 0 && !usage) {
    return undefined;
  }

  const parts: string[] = [
    '<?xml version="1.0"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about=""',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ' xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"',
    ' xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">',
  ];

  if (credit) {
    parts.push(
      `<dc:creator><rdf:Seq><rdf:li>${escapeXml(credit)}</rdf:li></rdf:Seq></dc:creator>`,
      `<photoshop:Credit>${escapeXml(credit)}</photoshop:Credit>`,
    );
  }
  if (altText) {
    parts.push(
      `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(altText)}</rdf:li></rdf:Alt></dc:description>`,
      `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(altText)}</rdf:li></rdf:Alt></dc:title>`,
    );
  }
  if (keywords.length > 0) {
    parts.push("<dc:subject><rdf:Bag>");
    for (const keyword of keywords) {
      parts.push(`<rdf:li>${escapeXml(keyword)}</rdf:li>`);
    }
    parts.push("</rdf:Bag></dc:subject>");
  }
  if (notes) {
    parts.push(`<photoshop:Instructions>${escapeXml(notes)}</photoshop:Instructions>`);
  }
  if (usage) {
    parts.push(
      `<xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(usage)}</rdf:li></rdf:Alt></xmpRights:UsageTerms>`,
    );
  }
  if (label) {
    parts.push(`<photoshop:Source>${escapeXml(label)}</photoshop:Source>`);
  }

  parts.push("</rdf:Description></rdf:RDF></x:xmpmeta>");
  return parts.join("");
}

/**
 * Map DAM editorial fields to Sharp `withExif` / `withXmp` payloads.
 * Camera EXIF is intentionally not restored.
 *
 * Note: Sharp writes classic EXIF as ASCII (diacritics folded). Prefer XMP for
 * full Unicode (credit, keywords, rights, notes).
 */
export function buildDamExportMetadata(
  editorial: DamExportEditorial,
): DamExportMetadataPayload | null {
  const credit = trimText(editorial.credit);
  const altText = trimText(editorial.altText);
  const notes = trimText(editorial.notes);
  const keywords = uniqueKeywords(editorial.keywords);
  const rightsType =
    editorial.rightsType === "own" ||
    editorial.rightsType === "provided" ||
    editorial.rightsType === "free_use"
      ? editorial.rightsType
      : null;
  const takenAtRaw = editorial.takenAt ?? null;
  const dateTime =
    takenAtRaw instanceof Date || typeof takenAtRaw === "string"
      ? formatExifDateTime(takenAtRaw)
      : null;

  const ifd0: Record<string, string> = {};
  if (credit) {
    ifd0.Artist = credit;
    const label = rightsLabel(rightsType);
    ifd0.Copyright = label ? `${credit} / ${label}` : credit;
  }
  if (altText) ifd0.ImageDescription = altText;
  if (Object.keys(ifd0).length > 0) ifd0.Software = "Tsüri HQ DAM";

  const ifd2: Record<string, string> = {};
  if (dateTime) ifd2.DateTimeOriginal = dateTime;

  const xmp = buildXmp({ credit, altText, notes, keywords, rightsType });

  const hasIfd0 = Object.keys(ifd0).length > 0;
  const hasIfd2 = Object.keys(ifd2).length > 0;
  if (!hasIfd0 && !hasIfd2 && !xmp) return null;

  return {
    ...(hasIfd0 || hasIfd2
      ? {
          exif: {
            ...(hasIfd0 ? { IFD0: ifd0 } : {}),
            ...(hasIfd2 ? { IFD2: ifd2 } : {}),
          },
        }
      : {}),
    ...(xmp ? { xmp } : {}),
  };
}
