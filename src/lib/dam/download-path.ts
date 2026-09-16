export type DamDownloadFormat = "original" | "jpeg";

export function publishedDownloadPath(
  assetId: string,
  format: DamDownloadFormat = "jpeg",
): string {
  const id = encodeURIComponent(assetId);
  if (format === "original") {
    return `/api/dam/assets/${id}/file?variant=original`;
  }
  return `/api/dam/assets/${id}/file?variant=export`;
}

/** @deprecated Use publishedDownloadPath — kept for callers that expect export JPEG. */
export function publishedExportPath(assetId: string): string {
  return publishedDownloadPath(assetId, "jpeg");
}
