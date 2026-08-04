import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { prisma } from "@/lib/db";

/** Legacy URL — Programm lebt jetzt auf der Redaktions-Seite. */
export default async function ProgrammPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const { membership } = await requireMembership();

  const redaktion = await prisma.space.findFirst({
    where: {
      organizationId: membership.organizationId,
      slug: "redaktion",
    },
    select: { id: true },
  });

  if (!redaktion) {
    redirect("/home");
  }

  const qs = week ? `?week=${encodeURIComponent(week)}#programm` : "#programm";
  redirect(`/spaces/${redaktion.id}${qs}`);
}
