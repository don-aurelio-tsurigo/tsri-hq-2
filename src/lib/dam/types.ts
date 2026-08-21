import type { DamEditParams } from "@/lib/dam/edit-params";

export type DamRightsType = "own" | "provided" | "free_use";

export const DAM_RIGHTS_LABELS: Record<DamRightsType, string> = {
  own: "Tsüri.ch",
  provided: "Zur Verfügung gestellt",
  free_use: "Freie Nutzung",
};

export const DAM_RIGHTS_HINTS: Record<DamRightsType, string> = {
  own: "Eigene Fotos, im Auftrag von Tsüri fotografiert. Alle Nutzungsrechte liegen bei Tsüri.",
  provided:
    "Wurde Tsüri.ch zur Publikation zur Verfügung gestellt. Darf nicht weitergegeben werden.",
  free_use:
    "Dieses Rechtepaket ist für Dateien konzipiert, die im Rahmen einer lizenzgebührenfreien, unbegrenzten und unbefristeten Nutzungsvereinbarung von Unsplash und anderen Plattformen erworben werden.",
};

export const DAM_RIGHTS_OPTIONS: {
  value: DamRightsType;
  label: string;
  hint: string;
}[] = (
  ["own", "provided", "free_use"] as const
).map((value) => ({
  value,
  label: DAM_RIGHTS_LABELS[value],
  hint: DAM_RIGHTS_HINTS[value],
}));

export function damRightsLabel(value: string): string {
  if (value === "own" || value === "provided" || value === "free_use") {
    return DAM_RIGHTS_LABELS[value];
  }
  return value;
}

export function damWepublishExportedHint(iso: string): string {
  return `Bereits exportiert am ${new Date(iso).toLocaleString("de-CH")}`;
}

export type AssetMetadataPatch = {
  fileName?: string;
  credit?: string;
  rightsType?: DamRightsType;
  altText?: string | null;
  keywords?: string[];
  notes?: string | null;
  takenAt?: string | null;
};

export type PersonalAssetCard = {
  id: string;
  fileName: string;
  credit: string;
  rating: number | null;
  editParams: DamEditParams;
  collections: { id: string; name: string }[];
  altText: string | null;
  keywords: string[];
  notes: string | null;
  takenAt: string | null;
  width: number | null;
  height: number | null;
  rightsType: DamRightsType;
  lastWepublishExportedAt: string | null;
};

export type ArchiveAssetCard = {
  id: string;
  fileName: string;
  credit: string;
  rating: number | null;
  altText: string | null;
  keywords: string[];
  notes: string | null;
  takenAt: string | null;
  publishedAt: string | null;
  width: number | null;
  height: number | null;
  rightsType: DamRightsType;
  collections: { id: string; name: string }[];
  lastWepublishExportedAt: string | null;
  editParams: DamEditParams;
};
