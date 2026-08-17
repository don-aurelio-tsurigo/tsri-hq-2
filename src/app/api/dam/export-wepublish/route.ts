import { NextResponse } from "next/server";
import { z } from "zod";
import { exportPublishedAssetToWepublish } from "@/lib/dam/export-wepublish";
import { R2ConfigError } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";
import { WepublishApiError } from "@/lib/wepublish/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  assetId: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bild fehlt." }, { status: 400 });
  }

  try {
    const result = await exportPublishedAssetToWepublish(
      auth.session.user.id,
      parsed.data.assetId,
    );
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof R2ConfigError || error instanceof WepublishApiError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[dam] wepublish export failed", error);
    return NextResponse.json(
      { error: "Senden an WePublish fehlgeschlagen." },
      { status: 500 },
    );
  }
}
