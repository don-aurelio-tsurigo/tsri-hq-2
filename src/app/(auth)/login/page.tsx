import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import {
  getArchivedMembership,
  getMembership,
  getSession,
} from "@/lib/session";
import { nameIsIncomplete } from "@/lib/user-name";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    const active = await getMembership(session.user.id);
    if (active) {
      if (nameIsIncomplete(active.user)) redirect("/complete-profile");
      redirect("/home");
    }
    if (nameIsIncomplete(session.user)) redirect("/complete-profile");
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
