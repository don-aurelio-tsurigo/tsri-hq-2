import JSZip from "jszip";
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
): Promise<void> {
  const res = await fetch("/api/dam/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetIds }),
  });
  const data = (await res.json()) as {
    files?: { url: string; fileName: string }[];
    error?: string;
  };
  if (!res.ok || !data.files?.length) {
    throw new Error(data.error || "Download fehlgeschlagen.");
  }

  const files = data.files;
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
  saveBlob(await zip.generateAsync({ type: "blob" }), `archiv-${zurichDateStamp()}.zip`);
}
