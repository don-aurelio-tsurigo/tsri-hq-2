import { NextResponse } from "next/server";
import { buildShopifyCsv, getPayoutDetail } from "@/lib/payrexx";
import { requireCapability } from "@/lib/session";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { membership } = await requireCapability("finance");
  const detail = await getPayoutDetail(membership.organizationId, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const csv = buildShopifyCsv(detail);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shopify_${detail.date}_${detail.uuid}.csv"`,
    },
  });
}
