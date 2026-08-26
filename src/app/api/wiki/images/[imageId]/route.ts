import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";
import { assertWikiR2Key } from "@/lib/wiki-images";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  _request: Request,
  routeCtx: { params: Promise<{ imageId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { imageId } = await routeCtx.params;
  if (!imageId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const image = await prisma.wikiImage.findFirst({
    where: {
      id: imageId,
      organizationId: auth.membership.organizationId,
    },
    select: {
      r2Key: true,
      contentType: true,
      organizationId: true,
    },
  });
  if (!image) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    assertWikiR2Key(image.r2Key, image.organizationId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const { buffer, contentType } = await getObject(image.r2Key);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": image.contentType || contentType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[wiki] image fetch failed", error);
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
