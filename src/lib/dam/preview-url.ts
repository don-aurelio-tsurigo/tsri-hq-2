import { sniffImageContentType } from "./accept";

/** Above this size the browser keeps the picked file as-is instead of copying it. */
export const LARGE_FILE_BYTES = 100 * 1024 * 1024;

/** Safari PWA often cannot paint HEIC in <img>; draw to a JPEG canvas first. */
export async function previewUrlForFile(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const sniffed = sniffImageContentType(head);
  if (sniffed === "image/heic" || sniffed === "image/heif") {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (blob && blob.size > 0) return URL.createObjectURL(blob);
    } catch (error) {
      console.warn("[dam] HEIC canvas preview failed", error);
    }
    // Firefox and Chrome have no HEIC decoder; let the server render a JPEG.
    try {
      const res = await fetch("/api/dam/heic-preview", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await file.arrayBuffer(),
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) return URL.createObjectURL(blob);
      }
    } catch (error) {
      console.warn("[dam] HEIC server preview failed", error);
    }
  }
  const type = sniffed ?? (file.type || "image/jpeg");
  // A second in-memory copy of a 650 MB TIFF can crash the tab.
  if (file.size > LARGE_FILE_BYTES) return URL.createObjectURL(file);
  // Copy bytes so xhr.send(file) cannot detach the blob: URL used in <img>.
  return URL.createObjectURL(new Blob([await file.arrayBuffer()], { type }));
}
