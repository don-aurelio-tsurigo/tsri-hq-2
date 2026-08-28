import type { Metadata } from "next";
import { FeedbackThanks } from "@/components/feedback-thanks";

export const metadata: Metadata = {
  title: "Danke für dein Feedback",
  robots: { index: false, follow: false },
};

export default async function FeedbackThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <FeedbackThanks id={id ?? ""} />;
}
