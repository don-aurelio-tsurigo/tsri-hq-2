import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { prisma } from "@/lib/db";
import { greetingName } from "@/lib/user-name";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { name: true, firstName: true } } },
  });

  if (!reset || reset.usedAt) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Link ungültig
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Der Link ist ungültig oder wurde bereits verwendet. Bitte einen Admin
          um einen neuen Link.
        </p>
        <Link href="/login" className="btn btn-primary mt-6 self-center">
          Zum Login
        </Link>
      </div>
    );
  }

  if (reset.expiresAt < new Date()) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Link abgelaufen
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Bitte einen Admin um einen neuen Reset-Link.
        </p>
        <Link href="/login" className="btn btn-primary mt-6 self-center">
          Zum Login
        </Link>
      </div>
    );
  }

  return (
    <ResetPasswordForm token={reset.token} userName={greetingName(reset.user)} />
  );
}
