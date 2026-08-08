import { redirect } from "next/navigation";
import { createCarouselPost } from "@/lib/actions";
import { requireMembership } from "@/lib/session";

export default async function NewCarouselPage() {
  await requireMembership();
  const { id } = await createCarouselPost();
  redirect(`/carousel/${id}`);
}
