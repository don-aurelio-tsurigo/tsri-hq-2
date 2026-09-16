export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
  "image/tiff",
  "image/tif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export const ALLOWED_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);

export const RAW_EXT = new Set([
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".dng",
  ".raf",
  ".orf",
  ".rw2",
  ".raw",
  ".srw",
  ".pef",
  ".nrw",
  ".kdc",
  ".dcr",
  ".erf",
  ".3fr",
  ".mef",
  ".mos",
  ".rwl",
  ".sr2",
  ".x3f",
]);

/** Print TIFFs regularly exceed 40 MB; 200 MB covers typical press masters. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);
export const MAX_FILES = 40;

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i).toLowerCase();
}

export function rejectReason(
  name: string,
  mime: string,
  size: number,
): string | null {
  if (size > MAX_FILE_BYTES) {
    return `«${name}» ist zu gross (max. ${MAX_FILE_MB} MB).`;
  }
  const ext = fileExtension(name);
  if (RAW_EXT.has(ext)) {
    return `RAW-Dateien (${ext}) werden nicht akzeptiert. Bitte JPEG, PNG, WebP, TIFF oder HEIC hochladen.`;
  }
  const mimeNorm = mime.trim().toLowerCase();
  const mimeOk = ALLOWED_MIME.has(mimeNorm);
  const extOk = ALLOWED_EXT.has(ext);
  // Mobile pickers often omit the extension or send an empty/generic MIME.
  if (extOk || mimeOk) return null;
  return `«${name || "Foto"}» hat ein nicht unterstütztes Format. Erlaubt: JPEG, PNG, WebP, TIFF, HEIC.`;
}

export function normalizedContentType(name: string, mime: string): string {
  const lower = mime.toLowerCase().trim();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  if (lower === "image/x-png") return "image/png";
  if (lower === "image/tif") return "image/tiff";
  if (lower === "image/heic-sequence") return "image/heic";
  if (lower === "image/heif-sequence") return "image/heif";
  if (ALLOWED_MIME.has(lower)) return lower;
  switch (fileExtension(name)) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    default:
      return "image/jpeg";
  }
}

export function outputExtension(contentType: string, originalName: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/tiff": {
      const ext = fileExtension(originalName).replace(".", "");
      return ext === "tif" || ext === "tiff" ? ext : "tiff";
    }
    case "image/heic":
    case "image/heif": {
      const ext = fileExtension(originalName).replace(".", "");
      return ext || "heic";
    }
    default:
      return "jpg";
  }
}

const HEIC_BRANDS = new Set([
  "heic",
  "heif",
  "heix",
  "mif1",
  "msf1",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "miaf",
]);

function ftypBrandAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  ).toLowerCase();
}

export function looksLikeHeicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (
    bytes[4] !== 0x66 ||
    bytes[5] !== 0x74 ||
    bytes[6] !== 0x79 ||
    bytes[7] !== 0x70
  ) {
    return false;
  }
  const boxSize =
    ((bytes[0] ?? 0) << 24) |
    ((bytes[1] ?? 0) << 16) |
    ((bytes[2] ?? 0) << 8) |
    (bytes[3] ?? 0);
  const limit = Math.min(
    bytes.length,
    boxSize >= 16 && boxSize <= 256 ? boxSize : bytes.length,
  );
  if (HEIC_BRANDS.has(ftypBrandAt(bytes, 8))) return true;
  for (let offset = 16; offset + 4 <= limit; offset += 4) {
    if (HEIC_BRANDS.has(ftypBrandAt(bytes, offset))) return true;
  }
  return false;
}

export function sniffImageContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // TIFF: II*\0 (LE) or MM\0* (BE)
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x4d &&
        bytes[1] === 0x4d &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x2a))
  ) {
    return "image/tiff";
  }
  if (looksLikeHeicBytes(bytes)) return "image/heic";
  return null;
}

export function looksLikeImageBytes(bytes: Uint8Array): boolean {
  return sniffImageContentType(bytes) !== null;
}
