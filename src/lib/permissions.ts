import type {
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

export function isAdmin(role: MembershipRole) {
  return role === "admin";
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
