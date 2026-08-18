import { NextResponse } from "next/server";
import { listPersonalStagingAssets, toPersonalAssetCard } from "@/lib/dam/queries";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getActiveMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await listPersonalStagingAssets(ctx.session.user.id);
  return NextResponse.json({ assets: rows.map(toPersonalAssetCard) });
}
