/** `source`: the lossless upload kept for print TIFFs (no edits applied). */
export type DamDownloadFormat = "original" | "jpeg" | "source";

export function publishedDownloadPath(
  assetId: string,
  format: DamDownloadFormat = "jpeg",
): string {
  const id = encodeURIComponent(assetId);
  if (format === "source") {
    return `/api/dam/assets/${id}/file?variant=source`;
  }
  if (format === "original") {
    return `/api/dam/assets/${id}/file?variant=original`;
  }
  return `/api/dam/assets/${id}/file?variant=export`;
}

/** @deprecated Use publishedDownloadPath — kept for callers that expect export JPEG. */
export function publishedExportPath(assetId: string): string {
  return publishedDownloadPath(assetId, "jpeg");
}
