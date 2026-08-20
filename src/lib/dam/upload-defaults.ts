export function creditDisplayName(credit: string): string {
  return (credit.split("/")[0] ?? credit).trim() || credit.trim();
}

export function zurichDateLabel(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

const COLLECTION_NAME_MAX = 120;

export function defaultCollectionName(notes: string, date = new Date()): string {
  const dateLabel = zurichDateLabel(date);
  const context = notes
    .trim()
    .split(/\n/)[0]
    ?.trim()
    .replace(/\s+/g, " ") ?? "";
  if (!context) return dateLabel;
  const prefix = `${dateLabel} – `;
  return `${prefix}${context}`.slice(0, COLLECTION_NAME_MAX);
}
