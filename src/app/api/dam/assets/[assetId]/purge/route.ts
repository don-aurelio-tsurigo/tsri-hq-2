import { NextResponse } from "next/server";
import { z } from "zod";
import { purgeAssetById } from "@/lib/dam/trash";
import { getActiveMembershipContext } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const parsed = z.string().min(1).max(64).safeParse(assetId);
  if (!parsed.success) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await purgeAssetById(auth.session.user.id, parsed.data);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  revalidatePath("/dam/archive");
  revalidatePath("/dam/papierkorb");
  revalidatePath("/dam");
  return NextResponse.json({ ok: true });
}
