import { NextResponse } from "next/server";
import { faceCropKey } from "@/lib/dam/r2-keys";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

/** Square face thumbnail written by the face scan. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ faceId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { faceId } = await ctx.params;
  const userId = auth.session.user.id;
  const face = await prisma.assetFace.findFirst({
    where: {
      id: faceId,
      asset: {
        OR: [
          { uploadedBy: userId, status: { in: ["staging", "rejected"] } },
          { status: { in: ["published", "archived"] } },
        ],
      },
    },
    select: { id: true },
  });
  if (!face) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const crop = await getObject(faceCropKey(face.id));
    return new Response(new Uint8Array(crop.buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(crop.buffer.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
