export type DamActor = { id: string };

export type DamAssetAccess = {
  id: string;
  status: string;
  uploadedBy: string;
};

/**
 * Who may move a published asset to trash, restore it, or purge it.
 * Currently any signed-in member; keep this the single switch for later roles.
 */
export function canDeleteAsset(user: DamActor, asset: DamAssetAccess): boolean {
  return Boolean(user.id && asset.id);
}
