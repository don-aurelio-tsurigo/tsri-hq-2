import exifr from "exifr";
import sharp from "sharp";
import type { Prisma } from "@/generated/prisma/client";
import type { ImageSource } from "@/lib/dam/heic";

export type ExtractedExif = {
  takenAt: Date | null;
  width: number | null;
  height: number | null;
  json: Prisma.InputJsonValue | null;
};

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function takenAtFromParsed(parsed: Record<string, unknown>): Date | null {
  return (
    asDate(parsed.DateTimeOriginal) ??
    asDate(parsed.CreateDate) ??
    asDate(parsed.ModifyDate) ??
    asDate(parsed.DateTime) ??
    asDate(parsed.DateCreated) ??
    asDate(parsed.CreationTime) ??
    asDate(parsed.MetadataDate)
  );
}

async function parseExifBuffer(
  source: ImageSource,
): Promise<Record<string, unknown> | undefined> {
  try {
    return (await exifr.parse(source, {
      tiff: true,
      xmp: true,
      iptc: true,
      gps: true,
      jfif: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
      // In-memory: read it all at once. On disk: let exifr read chunks.
      ...(typeof source === "string"
        ? {}
        : { firstChunkSize: source.length, chunkLimit: 1 }),
    })) as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

async function parseViaSharpExifSegment(
  source: ImageSource,
): Promise<Record<string, unknown> | undefined> {
  try {
    const meta = await sharp(source, { failOn: "none", limitInputPixels: false }).metadata();
    if (!meta.exif || meta.exif.length <= 8) return undefined;
    const tiff = meta.exif.subarray(6);
    if (tiff.length <= 4) return undefined;
    return (await exifr.parse(tiff, {
      tiff: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
      firstChunkSize: tiff.length,
      chunkLimit: 1,
    })) as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

export function takenAtFromObjectMetadata(
  metadata?: Record<string, string>,
): Date | null {
  const raw = metadata?.["taken-at"];
  return raw ? asDate(raw) : null;
}

export function resolveTakenAt(opts: {
  exifTakenAt?: Date | null;
  metadata?: Record<string, string>;
  existing?: Date | null;
}): Date | null {
  return (
    opts.exifTakenAt ??
    takenAtFromObjectMetadata(opts.metadata) ??
    opts.existing ??
    null
  );
}

export async function extractExif(source: ImageSource): Promise<ExtractedExif> {
  let parsed = await parseExifBuffer(source);
  if (!parsed || !takenAtFromParsed(parsed)) {
    const viaSharp = await parseViaSharpExifSegment(source);
    if (viaSharp) parsed = { ...parsed, ...viaSharp };
  }

  if (!parsed) {
    return { takenAt: null, width: null, height: null, json: null };
  }

  const takenAt = takenAtFromParsed(parsed);

  let width =
    asNumber(parsed.ExifImageWidth) ??
    asNumber(parsed.ImageWidth) ??
    asNumber(parsed.PixelXDimension);
  let height =
    asNumber(parsed.ExifImageHeight) ??
    asNumber(parsed.ImageHeight) ??
    asNumber(parsed.PixelYDimension);

  if (!width || !height) {
    try {
      const meta = await sharp(source, { failOn: "none", limitInputPixels: false }).metadata();
      width = width ?? meta.width ?? null;
      height = height ?? meta.height ?? null;
    } catch {
      /* keep exif dimensions */
    }
  }

  const json: Record<string, unknown> = {};
  const make = asString(parsed.Make);
  const model = asString(parsed.Model);
  const lens = asString(parsed.LensModel) ?? asString(parsed.Lens);
  const iso = asNumber(parsed.ISO);
  const fNumber = typeof parsed.FNumber === "number" ? parsed.FNumber : null;
  const exposure = asString(parsed.ExposureTime) ?? parsed.ExposureTime;
  const focal = typeof parsed.FocalLength === "number" ? parsed.FocalLength : null;
  const orientation = asNumber(parsed.Orientation);
  if (make) json.make = make;
  if (model) json.model = model;
  if (lens) json.lensModel = lens;
  if (iso != null) json.iso = iso;
  if (fNumber != null) json.fNumber = fNumber;
  if (exposure != null) json.exposureTime = exposure;
  if (focal != null) json.focalLength = focal;
  if (orientation != null) json.orientation = orientation;
  if (takenAt) json.dateTimeOriginal = takenAt.toISOString();
  if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
    json.gps = { lat: parsed.latitude, lng: parsed.longitude };
  }

  return {
    takenAt,
    width,
    height,
    json: Object.keys(json).length ? (json as Prisma.InputJsonValue) : null,
  };
}
