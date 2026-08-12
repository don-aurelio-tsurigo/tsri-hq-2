import { NextResponse } from "next/server";
import { buildDayCsv, getPayoutDetail } from "@/lib/payrexx";
import { requireAdmin } from "@/lib/session";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { membership } = await requireAdmin();
  const detail = await getPayoutDetail(membership.organizationId, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const csv = buildDayCsv(detail);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout_${detail.date}_${detail.uuid}.csv"`,
    },
  });
}
