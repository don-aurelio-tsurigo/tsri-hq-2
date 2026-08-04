import Link from "next/link";
import { AcceptInviteForm } from "@/components/accept-invite-form";
import { prisma } from "@/lib/db";

export default async function InviteTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invitation || invitation.acceptedAt) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Einladung ungültig
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Der Link ist abgelaufen, ungültig oder wurde bereits verwendet.
        </p>
        <Link href="/login" className="btn btn-primary mt-6 self-center">
          Zum Login
        </Link>
      </div>
    );
  }

  if (invitation.expiresAt < new Date()) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Einladung abgelaufen
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Bitte einen Admin um eine neue Einladung.
        </p>
        <Link href="/login" className="btn btn-primary mt-6 self-center">
          Zum Login
        </Link>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={invitation.token}
      email={invitation.email}
      orgName={invitation.organization.name}
    />
  );
}
