import JSZip from "jszip";
import type { DamDownloadFormat } from "@/lib/dam/download-path";
import { uniqueDownloadName, zurichDateStamp } from "@/lib/dam/filename";

function saveBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Phones save downloads to Files; only the share sheet offers «Bild sichern»
 * into Photos. Desktop keeps the classic download / ZIP.
 */
function shareToPhotosSupported(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  const mobile =
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  if (!mobile) return false;
  try {
    return navigator.canShare({
      files: [new File([new Uint8Array(1)], "probe.jpg", { type: "image/jpeg" })],
    });
  } catch {
    return false;
  }
}

/**
 * Safari only opens the share sheet shortly after a tap. When fetching took
 * too long, callers show a button that calls `share()` on a fresh tap.
 */
export class PendingPhotoShare extends Error {
  constructor(private readonly files: File[]) {
    super("Bilder bereit. Zum Sichern in Fotos nochmals tippen.");
    this.name = "PendingPhotoShare";
  }

  get count(): number {
    return this.files.length;
  }

  share(): Promise<void> {
    return shareFiles(this.files);
  }
}

async function shareFiles(files: File[]): Promise<void> {
  try {
    await navigator.share({ files });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new PendingPhotoShare(files);
    }
    throw error;
  }
}

async function fetchAsFile(url: string, fileName: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`«${fileName}» konnte nicht geladen werden.`);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

async function saveFromUrl(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("r2");
    saveBlob(await res.blob(), fileName);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export async function downloadPublishedAssets(
  assetIds: string[],
  onProgress?: (done: number, total: number) => void,
  format: DamDownloadFormat = "jpeg",
): Promise<void> {
  const res = await fetch("/api/dam/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetIds, format }),
  });
  const data = (await res.json()) as {
    files?: { url: string; fileName: string }[];
    error?: string;
  };
  if (!res.ok || !data.files?.length) {
    throw new Error(data.error || "Download fehlgeschlagen.");
  }

  const files = data.files;
  if (shareToPhotosSupported()) {
    const shared: File[] = [];
    try {
      for (const [index, file] of files.entries()) {
        shared.push(await fetchAsFile(file.url, file.fileName));
        onProgress?.(index + 1, files.length);
      }
    } catch {
      shared.length = 0;
    }
    if (shared.length === files.length && navigator.canShare({ files: shared })) {
      await shareFiles(shared);
      return;
    }
  }

  if (files.length === 1 && files[0]) {
    onProgress?.(1, 1);
    await saveFromUrl(files[0].url, files[0].fileName);
    return;
  }

  const zip = new JSZip();
  const used = new Set<string>();
  for (const [index, file] of files.entries()) {
    const fileRes = await fetch(file.url);
    if (!fileRes.ok) {
      throw new Error(`«${file.fileName}» konnte nicht geladen werden.`);
    }
    zip.file(uniqueDownloadName(used, file.fileName), await fileRes.blob());
    onProgress?.(index + 1, files.length);
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), `mediathek-${zurichDateStamp()}.zip`);
}
