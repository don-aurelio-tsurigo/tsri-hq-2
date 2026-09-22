/** Compress an image file to a JPEG data URL suitable for storing in slide JSON. */
export async function fileToCompressedDataUrl(
  file: File,
  opts?: { maxEdge?: number; quality?: number },
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Bitte eine Bilddatei wählen.");
  }

  const maxEdge = opts?.maxEdge ?? 1800;
  const quality = opts?.quality ?? 0.82;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nicht verfügbar.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("Bild konnte nicht verarbeitet werden.");
    }
    return { dataUrl, width, height };
  } finally {
    bitmap.close();
  }
}

/** Read natural width/height of an image URL (data, same-origin, or CORS). */
export function probeImageSize(
  src: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:") && !src.startsWith("/")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
