import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import {
  getArchivedMembership,
  getMembership,
  getSession,
} from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    const active = await getMembership(session.user.id);
    if (active) redirect("/home");
    const archived = await getArchivedMembership(session.user.id);
    if (archived) redirect("/access-revoked");
    redirect("/onboarding");
  }

  return (
    <Suspense fallback={<div className="p-8 text-center">Laden…</div>}>
      <LoginForm />
    </Suspense>
  );
}
