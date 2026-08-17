import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ batchId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { batchId } = await ctx.params;
  const batch = await prisma.uploadBatch.findFirst({
    where: { id: batchId, uploadedBy: auth.session.user.id },
    select: {
      id: true,
      credit: true,
      createdAt: true,
      assets: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          fileName: true,
          status: true,
          credit: true,
          rightsType: true,
          altText: true,
          keywords: true,
          takenAt: true,
          width: true,
          height: true,
        },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json(batch);
}
