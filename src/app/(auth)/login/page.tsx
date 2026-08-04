import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/home");
  }

  return (
    <Suspense fallback={<div className="p-8 text-center">Laden…</div>}>
      <LoginForm />
    </Suspense>
  );
}
