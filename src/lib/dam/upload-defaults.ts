export function creditDisplayName(credit: string): string {
  return (credit.split("/")[0] ?? credit).trim() || credit.trim();
}

export function zurichDateLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function defaultCollectionName(credit: string, date = new Date()): string {
  const name = creditDisplayName(credit);
  if (!name) return "";
  return `${name} – ${zurichDateLabel(date)}`;
}

export function suggestedRightsType(
  credit: string,
  meCredit: string,
): "own" | "provided" {
  const next = credit.trim();
  if (!next) return "provided";
  return next === meCredit.trim() ? "own" : "provided";
}
