import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  outputExtension,
  rejectReason,
  normalizedContentType,
} from "@/lib/dam/accept";
import { buildFileName, buildR2Key } from "@/lib/dam/filename";
import { prisma } from "@/lib/db";
import { ensureR2Cors, presignPutUrl, R2ConfigError } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

const fileSchema = z.object({
  name: z.string().min(1).max(240),
  type: z.string().max(120).optional().default(""),
  size: z.number().int().nonnegative(),
});

const bodySchema = z.object({
  credit: z.string().trim().min(1).max(200),
  titleBase: z.string().trim().max(120).optional(),
  files: z.array(fileSchema).min(1).max(MAX_FILES),
});

export async function POST(request: Request) {
  const ctx = await getActiveMembershipContext();
  if (!ctx) {
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
    return NextResponse.json(
      { error: "Credit und mindestens eine Datei sind nötig." },
      { status: 400 },
    );
  }

  const { credit, titleBase, files } = parsed.data;
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximal ${MAX_FILES} Dateien pro Batch.` },
      { status: 400 },
    );
  }

  const rejected = files
    .map((file) => rejectReason(file.name, file.type, file.size))
    .filter((msg): msg is string => Boolean(msg));
  if (rejected.length > 0) {
    return NextResponse.json({ error: rejected[0], errors: rejected }, { status: 400 });
  }

  const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
  if (oversized) {
    return NextResponse.json(
      { error: `«${oversized.name}» ist zu gross (max. 40 MB).` },
      { status: 400 },
    );
  }

  try {
    try {
      await ensureR2Cors();
    } catch (error) {
      console.warn("[dam] could not write R2 CORS policy", error);
    }

    const batch = await prisma.uploadBatch.create({
      data: {
        uploadedBy: ctx.session.user.id,
        credit,
      },
      select: { id: true },
    });

    const uploaded = await Promise.all(
      files.map(async (file, index) => {
        const sequence = index + 1;
        const contentType = normalizedContentType(file.name, file.type);
        const ext = outputExtension(contentType, file.name);
        const fileName = buildFileName(titleBase || credit, sequence, ext);
        const r2Key = buildR2Key({
          userId: ctx.session.user.id,
          batchId: batch.id,
          sequence,
          ext,
        });
        const uploadUrl = await presignPutUrl(r2Key, contentType);
        return {
          clientName: file.name,
          sequence,
          fileName,
          r2Key,
          uploadUrl,
          contentType,
        };
      }),
    );

    return NextResponse.json({ batchId: batch.id, credit, files: uploaded });
  } catch (error) {
    if (error instanceof R2ConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[dam] upload-url failed", error);
    return NextResponse.json(
      { error: "Presigned URLs konnten nicht erzeugt werden." },
      { status: 500 },
    );
  }
}
