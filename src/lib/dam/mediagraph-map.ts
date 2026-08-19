import { fileExtension, RAW_EXT } from "@/lib/dam/accept";
import type { DamRightsType } from "@/lib/dam/types";

export const MEDIAGRAPH_IMPORT_SOURCE = "mediagraph_import";
export const UNSORTED_COLLECTION_NAME = "Mediagraph-Archiv (unsortiert)";

const DEFAULT_RIGHTS_NAMES: Record<string, DamRightsType> = {
  "tsüri.ch": "own",
  "tsuri.ch": "own",
  "zvg (tsüri only)": "provided",
  "zvg (tsuri only)": "provided",
  "royalty free": "free_use",
};

export type MediagraphTag = {
  name?: string | null;
  sub_type?: string | null;
};

export type MediagraphCollectionRef = {
  id?: number | string | null;
  name?: string | null;
  path_names?: string[] | null;
};

export type MediagraphAsset = {
  id: number | string;
  guid?: string | null;
  filename?: string | null;
  type?: string | null;
  ext?: string | null;
  mime_type?: string | null;
  credit_line?: string | null;
  creator?: unknown;
  creator_tag?: { id?: number | string; name?: string | null } | null;
  creator_tag_id?: number | string | null;
  rights_package_id?: number | string | null;
  rights_status?: string | null;
  rights_package?: { id?: number | string; name?: string | null } | null;
  tags?: MediagraphTag[] | null;
  alt_text?: string | null;
  captured_at?: string | null;
  collections?: MediagraphCollectionRef[] | null;
  full_url?: string | null;
  created_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gps?: { lat?: number; latitude?: number; lng?: number; longitude?: number } | null;
};

export type RightsIdMap = {
  own: Set<string>;
  provided: Set<string>;
  free_use: Set<string>;
};

export function parseIdSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function defaultRightsIdMap(): RightsIdMap {
  return {
    own: parseIdSet(process.env.MEDIAGRAPH_RIGHTS_OWN_IDS),
    provided: parseIdSet(process.env.MEDIAGRAPH_RIGHTS_PROVIDED_IDS),
    free_use: parseIdSet(
      process.env.MEDIAGRAPH_RIGHTS_FREE_USE_IDS ?? process.env.MEDIAGRAPH_RIGHTS_FREE_IDS,
    ),
  };
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/ü/g, "u");
}

export function isImageAsset(asset: MediagraphAsset): boolean {
  return (asset.type ?? "").trim().toLowerCase() === "image";
}

export function assetGuid(asset: MediagraphAsset): string | null {
  const guid = asText(asset.guid);
  return guid || null;
}

export function creditFromAsset(
  asset: MediagraphAsset,
  creatorTagName?: string | null,
): string {
  const line = asText(asset.credit_line);
  if (line) return line.slice(0, 200);
  const tagName = asText(creatorTagName) || asText(asset.creator_tag?.name);
  if (tagName) return tagName.slice(0, 200);
  const creators = Array.isArray(asset.creator) ? asset.creator : [];
  for (const item of creators) {
    const name = asText(item);
    if (name) return name.slice(0, 200);
  }
  return "Unbekannt";
}

export function mapRightsType(
  asset: MediagraphAsset,
  ids = defaultRightsIdMap(),
): DamRightsType | null {
  const packageId = asText(asset.rights_package_id ?? asset.rights_package?.id);
  if (packageId && ids.own.has(packageId)) return "own";
  if (packageId && ids.provided.has(packageId)) return "provided";
  if (packageId && ids.free_use.has(packageId)) return "free_use";

  const packageName = asText(asset.rights_package?.name);
  const status = asText(asset.rights_status);
  for (const raw of [packageName, status]) {
    if (!raw) continue;
    const mapped = DEFAULT_RIGHTS_NAMES[raw.toLowerCase()] ?? DEFAULT_RIGHTS_NAMES[normalizeName(raw)];
    if (mapped) return mapped;
  }
  return null;
}

export function keywordsFromTags(tags: MediagraphTag[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags ?? []) {
    const name = asText(tag.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name.slice(0, 80));
  }
  return out.slice(0, 80);
}

export function collectionNamesFromAsset(asset: MediagraphAsset): string[] {
  const names = (asset.collections ?? [])
    .map((collection) => flattenCollectionName(collection))
    .filter(Boolean);
  return names.length > 0 ? [...new Set(names)] : [UNSORTED_COLLECTION_NAME];
}

export function flattenCollectionName(collection: MediagraphCollectionRef): string {
  const path = (collection.path_names ?? []).map((part) => asText(part)).filter(Boolean);
  if (path.length > 0) return path.join(" / ");
  return asText(collection.name);
}

export function shouldUseFullRendition(asset: MediagraphAsset): boolean {
  const ext = fileExtension(asset.filename || `file.${asset.ext ?? ""}`);
  const rawExt = `.${(asset.ext ?? "").replace(/^\./, "").toLowerCase()}`;
  return RAW_EXT.has(ext) || RAW_EXT.has(rawExt);
}

export function takenAtFromAsset(asset: MediagraphAsset, exifTakenAt: Date | null): Date | null {
  if (exifTakenAt) return exifTakenAt;
  const raw = asText(asset.captured_at);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function gpsFromAsset(asset: MediagraphAsset): { lat: number; lng: number } | null {
  const lat =
    typeof asset.latitude === "number"
      ? asset.latitude
      : typeof asset.gps?.lat === "number"
        ? asset.gps.lat
        : typeof asset.gps?.latitude === "number"
          ? asset.gps.latitude
          : null;
  const lng =
    typeof asset.longitude === "number"
      ? asset.longitude
      : typeof asset.gps?.lng === "number"
        ? asset.gps.lng
        : typeof asset.gps?.longitude === "number"
          ? asset.gps.longitude
          : null;
  if (lat == null || lng == null) return null;
  return { lat, lng };
}
