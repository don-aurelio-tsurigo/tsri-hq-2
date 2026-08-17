import type { DamEditParams } from "@/lib/dam/edit-params";

export type DamRightsType = "own" | "provided" | "free_use";

export const DAM_RIGHTS_LABELS: Record<DamRightsType, string> = {
  own: "Eigenes Foto",
  provided: "Zur Verfügung gestellt",
  free_use: "Freie Nutzung",
};

export function damRightsLabel(value: string): string {
  if (value === "own" || value === "provided" || value === "free_use") {
    return DAM_RIGHTS_LABELS[value];
  }
  return value;
}

export type AssetMetadataPatch = {
  fileName?: string;
  credit?: string;
  rightsType?: DamRightsType;
  altText?: string | null;
  keywords?: string[];
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
  takenAt: string | null;
  width: number | null;
  height: number | null;
  rightsType: DamRightsType;
};

export type ArchiveAssetCard = {
  id: string;
  fileName: string;
  credit: string;
  rating: number | null;
  altText: string | null;
  keywords: string[];
  takenAt: string | null;
  publishedAt: string | null;
  width: number | null;
  height: number | null;
  rightsType: DamRightsType;
  collections: { id: string; name: string }[];
};
