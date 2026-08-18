export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
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

export const MAX_FILE_BYTES = 40 * 1024 * 1024;
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
    return `«${name}» ist zu gross (max. 40 MB).`;
  }
  const ext = fileExtension(name);
  if (RAW_EXT.has(ext)) {
    return `RAW-Dateien (${ext}) werden nicht akzeptiert. Bitte JPEG, PNG, WebP oder HEIC hochladen.`;
  }
  const mimeNorm = mime.trim().toLowerCase();
  const mimeOk = ALLOWED_MIME.has(mimeNorm);
  const extOk = ALLOWED_EXT.has(ext);
  // Mobile pickers often omit the extension or send an empty/generic MIME.
  if (extOk || mimeOk) return null;
  return `«${name || "Foto"}» hat ein nicht unterstütztes Format. Erlaubt: JPEG, PNG, WebP, HEIC.`;
}

export function normalizedContentType(name: string, mime: string): string {
  const lower = mime.toLowerCase().trim();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  if (lower === "image/x-png") return "image/png";
  if (lower === "image/heic-sequence") return "image/heic";
  if (lower === "image/heif-sequence") return "image/heif";
  if (ALLOWED_MIME.has(lower)) return lower;
  switch (fileExtension(name)) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
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
    case "image/heic":
    case "image/heif": {
      const ext = fileExtension(originalName).replace(".", "");
      return ext || "heic";
    }
    default:
      return "jpg";
  }
}

export function looksLikeImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  // HEIC/HEIF: ftyp box at offset 4
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(
      bytes[8] ?? 0,
      bytes[9] ?? 0,
      bytes[10] ?? 0,
      bytes[11] ?? 0,
    );
    return ["heic", "heif", "heix", "mif1", "msf1", "heim", "heis"].includes(
      brand,
    );
  }
  return false;
}
