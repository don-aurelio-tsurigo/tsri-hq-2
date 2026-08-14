import { notFound } from "next/navigation";
import { CarouselEditor } from "@/components/carousel-editor";
import { getCarouselPost, parseSlides } from "@/lib/carousel";
import { parseCarouselFormat } from "@/lib/carousel/format";
import { requireMembership } from "@/lib/session";
import { stripArticleHeaderFromBody, recoverPreTitleFromBody } from "@/lib/wepublish/article";

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
  const sourcePreTitle =
    post.sourcePreTitle ||
    recoverPreTitleFromBody(post.sourceBody, {
      title: post.sourceTitle,
      lead: post.sourceLead,
    });
  const cleanedBody = post.sourceBody
    ? stripArticleHeaderFromBody(post.sourceBody, {
        preTitle: sourcePreTitle,
        title: post.sourceTitle,
        lead: post.sourceLead,
      })
    : null;
  const sourceArticle =
    sourcePreTitle ||
    post.sourceTitle ||
    post.sourceLead ||
    cleanedBody
      ? {
          url: post.sourceUrl,
          preTitle: sourcePreTitle,
          title: post.sourceTitle,
          lead: post.sourceLead,
          body: cleanedBody,
        }
      : null;

  return (
    <CarouselEditor
      postId={post.id}
      initialTitle={post.title}
      initialSlides={slides}
      createdByName={post.createdBy.name}
      canEdit={post.createdById === session.user.id}
      sourceArticle={sourceArticle}
      format={parseCarouselFormat(post.format)}
    />
  );
}
