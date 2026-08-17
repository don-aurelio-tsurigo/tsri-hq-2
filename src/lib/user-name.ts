export function splitDisplayName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function joinDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function nameIsIncomplete(user: {
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  return !user.firstName?.trim() || !user.lastName?.trim();
}

export function greetingName(user: {
  firstName?: string | null;
  name: string;
}): string {
  const first = user.firstName?.trim();
  if (first) return first;
  return user.name.trim().split(/\s+/)[0] || user.name;
}
