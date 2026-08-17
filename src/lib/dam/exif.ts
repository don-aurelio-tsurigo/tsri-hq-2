import exifr from "exifr";
import type { Prisma } from "@/generated/prisma/client";

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

export async function extractExif(buffer: Buffer): Promise<ExtractedExif> {
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = (await exifr.parse(buffer, {
      tiff: true,
      xmp: true,
      icc: false,
      iptc: true,
      gps: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
    })) as Record<string, unknown> | undefined;
  } catch {
    parsed = undefined;
  }

  if (!parsed) {
    return { takenAt: null, width: null, height: null, json: null };
  }

  const takenAt =
    asDate(parsed.DateTimeOriginal) ??
    asDate(parsed.CreateDate) ??
    asDate(parsed.ModifyDate) ??
    asDate(parsed.DateTime);

  const width =
    asNumber(parsed.ExifImageWidth) ??
    asNumber(parsed.ImageWidth) ??
    asNumber(parsed.PixelXDimension);
  const height =
    asNumber(parsed.ExifImageHeight) ??
    asNumber(parsed.ImageHeight) ??
    asNumber(parsed.PixelYDimension);

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
