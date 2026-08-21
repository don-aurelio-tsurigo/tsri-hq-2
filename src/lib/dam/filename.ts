export function zurichDateStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}${m}${d}`;
}

export function padSequence(n: number): string {
  return String(n).padStart(3, "0");
}

export function sanitizeFileTitle(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "-")
    .replace(/[\r\n"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 200) || "foto";
}

export function buildFileName(
  title: string,
  sequence: number,
  ext: string,
): string {
  const cleanExt = ext.replace(/^\./, "").toLowerCase() || "jpg";
  return `${sanitizeFileTitle(title)}-${padSequence(sequence)}.${cleanExt}`;
}

export function buildR2Key(opts: {
  userId: string;
  batchId: string;
  sequence: number;
  ext: string;
}): string {
  const shortUuid = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const cleanExt = opts.ext.replace(/^\./, "").toLowerCase();
  return `staging/${opts.userId}/${opts.batchId}/${padSequence(opts.sequence)}-${shortUuid}.${cleanExt}`;
}

export function buildArchiveKey(opts: {
  userId: string;
  assetId: string;
  ext: string;
}): string {
  const cleanExt = opts.ext.replace(/^\./, "").toLowerCase();
  const shortUuid = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `archive/${opts.userId}/${opts.assetId}/${shortUuid}.${cleanExt}`;
}

export function buildMediagraphArchiveKey(mediagraphId: string, ext: string): string {
  const cleanExt = ext.replace(/^\./, "").toLowerCase() || "jpg";
  const id = mediagraphId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80) || "unknown";
  const shortUuid = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `archive/mediagraph-import/${id}-${shortUuid}.${cleanExt}`;
}

export function fileExtension(nameOrKey: string): string {
  const base = nameOrKey.split("/").pop() ?? nameOrKey;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "jpg";
  const ext = base.slice(dot + 1).toLowerCase();
  if (!ext) return "jpg";
  return ext === "jpeg" ? "jpg" : ext;
}

export function replaceKeyExtension(key: string, ext: string): string {
  const clean = ext.replace(/^\./, "").toLowerCase();
  const slash = key.lastIndexOf("/");
  const file = slash >= 0 ? key.slice(slash + 1) : key;
  const dir = slash >= 0 ? key.slice(0, slash + 1) : "";
  const dot = file.lastIndexOf(".");
  const base = dot >= 0 ? file.slice(0, dot) : file;
  return `${dir}${base}.${clean}`;
}

export function contentDispositionAttachment(fileName: string): string {
  const base =
    fileName.replace(/[/\\]/g, "").replace(/[\r\n"]/g, "_").trim() || "download.jpg";
  const ascii = base.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}

export function uniqueDownloadName(used: Set<string>, fileName: string): string {
  const cleaned = fileName.replace(/[/\\]/g, "").trim() || "download.jpg";
  if (!used.has(cleaned)) {
    used.add(cleaned);
    return cleaned;
  }
  const dot = cleaned.lastIndexOf(".");
  const base = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  let n = 2;
  let candidate = `${base}-${n}${ext}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export function derivativeKey(
  r2Key: string,
  kind: "thumb" | "web",
): string {
  const slash = r2Key.lastIndexOf("/");
  const file = slash >= 0 ? r2Key.slice(slash + 1) : r2Key;
  const dir = slash >= 0 ? r2Key.slice(0, slash + 1) : "";
  const dot = file.lastIndexOf(".");
  const base = dot >= 0 ? file.slice(0, dot) : file;
  return `${dir}${base}_${kind}.webp`;
}
