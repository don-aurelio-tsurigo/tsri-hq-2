import type {
  AppCapability,
  Membership,
  MembershipRole,
  Space,
  SpaceAccess,
  SpacePermission,
  Task,
  User,
} from "@/generated/prisma/client";

export type SpaceWithAccess = Space & {
  access?: SpaceAccess[];
};

export type MembershipWithGrants = Pick<Membership, "role"> & {
  grants?: { capability: AppCapability }[];
};

export type TagKind = "access" | "group";
export type TagPool = "editorial" | "civic_media";

export const ASSIGNABLE_CAPABILITIES: {
  key: AppCapability;
  label: string;
  kind: TagKind;
  pool: TagPool | null;
}[] = [
  { key: "editorial", label: "Redaktion", kind: "group", pool: "editorial" },
  { key: "finance", label: "Finance", kind: "access", pool: null },
  {
    key: "editorial_lead",
    label: "Redaktionsleitung",
    kind: "group",
    pool: "editorial",
  },
  {
    key: "civic_media",
    label: "Civic Media",
    kind: "group",
    pool: "civic_media",
  },
  {
    key: "civic_media_lead",
    label: "Civic Media Leitung",
    kind: "group",
    pool: "civic_media",
  },
];

export const TAG_POOL_KEYS: Record<TagPool, AppCapability[]> = {
  editorial: ["editorial", "editorial_lead"],
  civic_media: ["civic_media", "civic_media_lead"],
};

export function isAdmin(role: MembershipRole) {
  return role === "admin";
}

export function hasExplicitTag(
  membership: MembershipWithGrants,
  capability: AppCapability,
): boolean {
  return (membership.grants ?? []).some((g) => g.capability === capability);
}

export function inTagPool(
  membership: MembershipWithGrants,
  pool: TagPool,
): boolean {
  return TAG_POOL_KEYS[pool].some((key) => hasExplicitTag(membership, key));
}

/**
 * Access tags (Finance): admin implies.
 * Group tags (Redaktion, Civic Media): only the explicit checkbox.
 */
export function hasCapability(
  membership: MembershipWithGrants,
  capability: AppCapability,
): boolean {
  const tag = ASSIGNABLE_CAPABILITIES.find((t) => t.key === capability);
  if (tag?.kind === "access" && isAdmin(membership.role)) return true;
  return hasExplicitTag(membership, capability);
}

export function canAccessCivicMedia(membership: MembershipWithGrants) {
  return isAdmin(membership.role) || inTagPool(membership, "civic_media");
}

export function canManageEditorial(membership: MembershipWithGrants) {
  return isAdmin(membership.role) || hasExplicitTag(membership, "editorial_lead");
}

/** Can the user see this space? */
export function canViewSpace(
  user: Pick<User, "id">,
  space: SpaceWithAccess,
  membership: Pick<Membership, "role" | "organizationId"> | null,
): boolean {
  if (!membership || membership.organizationId !== space.organizationId) {
    return false;
  }

  if (space.type === "personal") {
    return space.ownerUserId === user.id;
  }

  if (space.visibility === "private") {
    return space.ownerUserId === user.id;
  }

  if (space.visibility === "team") {
    return true;
  }

  // restricted
  if (space.ownerUserId === user.id || membership.role === "admin") {
    return true;
  }
  return (space.access ?? []).some((a) => a.userId === user.id);
}

/** Can the user create/edit tasks in this space? */
export function canEditSpace(
  user: Pick<User, "id">,
  space: SpaceWithAccess,
  membership: Pick<Membership, "role" | "organizationId"> | null,
): boolean {
  if (!canViewSpace(user, space, membership)) {
    return false;
  }

  if (space.type === "personal") {
    return space.ownerUserId === user.id;
  }

  if (membership?.role === "admin") {
    return true;
  }

  if (space.visibility === "restricted") {
    const access = (space.access ?? []).find((a) => a.userId === user.id);
    return (
      space.ownerUserId === user.id ||
      access?.permission === "edit" ||
      access?.permission === "admin"
    );
  }

  // team-visible spaces: all members can edit in MVP
  return true;
}

export function canManageMembers(role: MembershipRole) {
  return role === "admin";
}

export function canEditTask(
  user: Pick<User, "id">,
  task: Pick<Task, "createdById" | "assigneeId" | "spaceId">,
  space: SpaceWithAccess,
  membership: Pick<Membership, "role" | "organizationId"> | null,
): boolean {
  if (!canEditSpace(user, space, membership)) {
    return false;
  }
  if (membership?.role === "admin") return true;
  if (task.createdById === user.id || task.assigneeId === user.id) return true;
  return space.type !== "personal";
}

export function hasMinPermission(
  permission: SpacePermission,
  required: SpacePermission,
): boolean {
  const rank: Record<SpacePermission, number> = {
    view: 1,
    edit: 2,
    admin: 3,
  };
  return rank[permission] >= rank[required];
}
