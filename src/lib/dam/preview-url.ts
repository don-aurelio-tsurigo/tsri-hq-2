import { blobUrlForPreview, sniffImageContentType } from "./accept";

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
  }
  return blobUrlForPreview(file, sniffed);
}
