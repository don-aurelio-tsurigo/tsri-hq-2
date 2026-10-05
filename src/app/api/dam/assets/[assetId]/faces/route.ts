import { NextResponse } from "next/server";
import { canEditAssetFaces, listDamPersons, loadAssetFacesState } from "@/lib/dam/face-assign";
import { faceRecognitionEnabled } from "@/lib/dam/face-rekognition";
import { prisma } from "@/lib/db";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

/** Faces + «Personen» of one asset, plus all known persons for the picker. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { assetId } = await ctx.params;
  const userId = auth.session.user.id;
  const visible = await prisma.asset.findFirst({
    where: {
      id: assetId,
      OR: [
        { uploadedBy: userId, status: { in: ["staging", "rejected"] } },
        { status: { in: ["published", "archived"] } },
      ],
    },
    select: { id: true },
  });
  if (!visible) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [state, allPersons, canEdit] = await Promise.all([
    loadAssetFacesState(assetId),
    listDamPersons(),
    canEditAssetFaces(userId, assetId),
  ]);
  if (!state) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(
    { ...state, allPersons, canEdit, scanEnabled: faceRecognitionEnabled() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
