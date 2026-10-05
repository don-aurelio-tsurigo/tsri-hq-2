import { notFound } from "next/navigation";
import { DamPersonDetailView } from "@/components/dam-persons";
import { loadPersonDetail } from "@/lib/dam/face-overview";
import { pageTitle } from "@/lib/link-preview";
import { requireMembership } from "@/lib/session";

export const metadata = pageTitle("Person");

export default async function DamPersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { session } = await requireMembership();
  const { personId } = await params;
  const person = await loadPersonDetail(session.user.id, personId);
  if (!person) notFound();

  return (
    <div className="mx-auto max-w-7xl">
      <DamPersonDetailView key={person.id + person.name} person={person} />
    </div>
  );
}
