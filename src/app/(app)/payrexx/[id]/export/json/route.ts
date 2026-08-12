import { NextResponse } from "next/server";
import { buildJsonExport, getPayoutDetail } from "@/lib/payrexx";
import { requireMembership } from "@/lib/session";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { membership } = await requireMembership();
  const detail = await getPayoutDetail(membership.organizationId, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = JSON.stringify(buildJsonExport(detail), null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout_${detail.date}_${detail.uuid}.json"`,
    },
  });
}
