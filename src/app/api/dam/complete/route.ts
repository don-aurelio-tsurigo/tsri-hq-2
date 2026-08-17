import { after, NextResponse } from "next/server";
import { z } from "zod";
import { RightsType } from "@/generated/prisma/client";
import { MAX_FILES, rejectReason } from "@/lib/dam/accept";
import { processDamAssets } from "@/lib/dam/process";
import { prisma } from "@/lib/db";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

const rightsSchema = z.enum(["own", "provided", "free_use"]);

const assetSchema = z.object({
  r2Key: z.string().min(1).max(500),
  sequence: z.number().int().positive(),
  fileName: z.string().min(1).max(240),
  originalName: z.string().min(1).max(240),
  contentType: z.string().min(1).max(120),
  size: z.number().int().nonnegative().optional(),
  rightsType: rightsSchema.optional(),
  keywords: z.array(z.string().trim().max(60)).max(24).optional(),
  credit: z.string().trim().max(200).optional(),
  collectionIds: z.array(z.string().min(1)).max(20).optional(),
  newCollections: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
});

const bodySchema = z.object({
  batchId: z.string().min(1),
  applyToAll: z.boolean(),
  rightsType: rightsSchema,
  keywords: z.array(z.string().trim().max(60)).max(24).default([]),
  collectionIds: z.array(z.string().min(1)).max(20).default([]),
  newCollections: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  assets: z.array(assetSchema).min(1).max(MAX_FILES),
});

function parseKeywords(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    for (const part of raw.split(",")) {
      const k = part.trim();
      if (!k) continue;
      const key = k.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(k);
    }
  }
  return out.slice(0, 24);
}

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
      { error: "Metadaten unvollständig oder ungültig." },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const userId = ctx.session.user.id;

  const rejected = body.assets
    .map((asset) =>
      rejectReason(asset.originalName, asset.contentType, asset.size ?? 0),
    )
    .filter((msg): msg is string => Boolean(msg));
  if (rejected.length > 0) {
    return NextResponse.json({ error: rejected[0], errors: rejected }, { status: 400 });
  }

  const batch = await prisma.uploadBatch.findFirst({
    where: { id: body.batchId, uploadedBy: userId },
    include: { assets: { select: { id: true } } },
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch nicht gefunden." }, { status: 404 });
  }
  if (batch.assets.length > 0) {
    return NextResponse.json({
      batchId: batch.id,
      assetIds: batch.assets.map((a) => a.id),
      alreadyCompleted: true,
    });
  }

  const r2Keys = body.assets.map((a) => a.r2Key);
  if (new Set(r2Keys).size !== r2Keys.length) {
    return NextResponse.json({ error: "Doppelte r2Key." }, { status: 400 });
  }
  const prefix = `staging/${userId}/${batch.id}/`;
  if (body.assets.some((a) => !a.r2Key.startsWith(prefix))) {
    return NextResponse.json({ error: "r2Key gehört nicht zu diesem Batch." }, { status: 400 });
  }

  try {
    const createdIds = await prisma.$transaction(async (tx) => {
      async function resolveCollections(
        ids: string[],
        names: string[],
      ): Promise<string[]> {
        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.length > 0) {
          const found = await tx.collection.count({
            where: { id: { in: uniqueIds } },
          });
          if (found !== uniqueIds.length) {
            throw new Error("COLLECTION_NOT_FOUND");
          }
        }
        const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
        const created = await Promise.all(
          uniqueNames.map((name) =>
            tx.collection.create({
              data: { name, createdBy: userId, isPersonal: true },
              select: { id: true },
            }),
          ),
        );
        return [...new Set([...uniqueIds, ...created.map((c) => c.id)])];
      }

      const batchCollectionIds = await resolveCollections(
        body.collectionIds,
        body.newCollections,
      );

      const ids: string[] = [];
      for (const asset of body.assets) {
        const rightsType = (
          body.applyToAll ? body.rightsType : (asset.rightsType ?? body.rightsType)
        ) as RightsType;
        const keywords = parseKeywords(
          body.applyToAll
            ? body.keywords
            : (asset.keywords ?? body.keywords),
        );
        const credit =
          !body.applyToAll && asset.credit?.trim()
            ? asset.credit.trim()
            : batch.credit;
        const collectionIds = body.applyToAll
          ? batchCollectionIds
          : await resolveCollections(
              asset.collectionIds ?? body.collectionIds,
              asset.newCollections ?? [],
            );

        const row = await tx.asset.create({
          data: {
            batchId: batch.id,
            sequence: asset.sequence,
            fileName: asset.fileName,
            r2Key: asset.r2Key,
            status: "staging",
            credit,
            rightsType,
            keywords,
            uploadedBy: userId,
            collections: {
              create: collectionIds.map((collectionId) => ({ collectionId })),
            },
          },
          select: { id: true },
        });
        ids.push(row.id);
      }
      return ids;
    });

    after(async () => {
      await processDamAssets(createdIds);
    });

    return NextResponse.json({ batchId: batch.id, assetIds: createdIds });
  } catch (error) {
    if (error instanceof Error && error.message === "COLLECTION_NOT_FOUND") {
      return NextResponse.json(
        { error: "Eine gewählte Collection existiert nicht mehr." },
        { status: 400 },
      );
    }
    console.error("[dam] complete failed", error);
    return NextResponse.json(
      { error: "Batch konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }
}
