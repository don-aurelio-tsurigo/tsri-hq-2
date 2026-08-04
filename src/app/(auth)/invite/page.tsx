import Link from "next/link";

export default function InviteIndexPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
        Einladung nötig
      </h1>
      <p className="mt-3 text-[var(--muted)]">
        Neue Accounts entstehen nur über einen Einladungslink von einem Admin.
        Bitte frage im Team nach.
      </p>
      <Link href="/login" className="btn btn-primary mt-6 self-center">
        Zum Login
      </Link>
    </div>
  );
}
