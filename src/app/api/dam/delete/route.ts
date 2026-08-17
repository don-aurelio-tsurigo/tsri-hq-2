import { NextResponse } from "next/server";
import { z } from "zod";
import { TRASH_BATCH_MAX, movePublishedAssetsToTrash } from "@/lib/dam/trash";
import { getActiveMembershipContext } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const bodySchema = z.object({
  assetIds: z.array(z.string().min(1).max(64)).min(1).max(TRASH_BATCH_MAX),
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
    return NextResponse.json({ error: "Keine Bilder gewählt." }, { status: 400 });
  }

  const result = await movePublishedAssetsToTrash(
    auth.session.user.id,
    parsed.data.assetIds,
  );
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  revalidatePath("/dam/archive");
  revalidatePath("/dam/papierkorb");
  revalidatePath("/dam");
  return NextResponse.json({ ids: result.ids });
}
