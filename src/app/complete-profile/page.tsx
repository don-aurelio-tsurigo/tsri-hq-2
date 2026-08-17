import { redirect } from "next/navigation";
import { CompleteProfileForm } from "@/components/complete-profile-form";
import { prisma } from "@/lib/db";
import {
  getArchivedMembership,
  getMembership,
  requireSession,
} from "@/lib/session";
import { nameIsIncomplete, splitDisplayName } from "@/lib/user-name";

export default async function CompleteProfilePage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true, name: true },
  });
  if (!user || !nameIsIncomplete(user)) {
    const membership = await getMembership(session.user.id);
    if (membership) redirect("/home");
    const archived = await getArchivedMembership(session.user.id);
    if (archived) redirect("/access-revoked");
    redirect("/onboarding");
  }

  const fromExisting = splitDisplayName(user.name);

  return (
    <CompleteProfileForm
      defaultFirstName={user.firstName?.trim() || fromExisting.firstName}
      defaultLastName={user.lastName?.trim() || fromExisting.lastName}
    />
  );
}
