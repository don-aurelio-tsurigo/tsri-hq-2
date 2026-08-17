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

export function defaultCollectionName(credit: string, date = new Date()): string {
  const name = creditDisplayName(credit);
  if (!name) return "";
  return `${zurichDateLabel(date)} – ${name}`;
}

export function suggestedRightsType(
  credit: string,
  meCredit: string,
): "own" | "provided" {
  const next = credit.trim();
  if (!next) return "provided";
  return next === meCredit.trim() ? "own" : "provided";
}
