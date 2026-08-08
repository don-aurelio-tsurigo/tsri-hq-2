"use client";

import { useTransition } from "react";
import { createCarouselPost } from "@/lib/actions";

export function CreateCarouselButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          void createCarouselPost();
        });
      }}
    >
      {pending ? "Wird erstellt…" : "Neu erstellen"}
    </button>
  );
}
