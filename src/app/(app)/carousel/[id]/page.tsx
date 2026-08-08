import { notFound } from "next/navigation";
import { CarouselEditor } from "@/components/carousel-editor";
import { getCarouselPost, parseSlides } from "@/lib/carousel";
import { requireMembership } from "@/lib/session";

export default async function CarouselEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requireMembership();
  const { id } = await params;
  const post = await getCarouselPost(id);
  if (!post) notFound();

  const slides = parseSlides(post.slides);

  return (
    <CarouselEditor
      postId={post.id}
      initialTitle={post.title}
      initialSlides={slides}
      createdByName={post.createdBy.name}
      canEdit={post.createdById === session.user.id}
    />
  );
}
