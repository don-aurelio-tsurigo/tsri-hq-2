"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AccessRevokedSignOut() {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-primary w-full" onClick={signOut}>
      Abmelden
    </button>
  );
}
