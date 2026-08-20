"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { parseEditParams } from "@/lib/dam/edit-params";
import { applyKeywordChanges, uniqueKeywords } from "@/lib/dam/keywords";
import { publishDamAssets } from "@/lib/dam/publish";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";

const idsSchema = z.array(z.string().min(1)).min(1).max(200);
const ratingSchema = z.number().int().min(1).max(5);

function revalidateDam() {
  revalidatePath("/dam/personal");
  revalidatePath("/dam");
  revalidatePath("/dam/archive");
  revalidatePath("/dam/papierkorb");
}

async function ownedStagingAssets(userId: string, ids: string[]) {
  const rows = await prisma.asset.findMany({
    where: {
      id: { in: ids },
      uploadedBy: userId,
      status: "staging",
    },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

async function editableAssets(userId: string, ids: string[]) {
  const rows = await prisma.asset.findMany({
    where: {
      id: { in: ids },
      OR: [{ status: "published" }, { status: "staging", uploadedBy: userId }],
    },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

export async function setAssetRating(
  assetId: string,
  rating: number,
): Promise<{ error?: string }> {
  const { session } = await requireMembership();
  const parsedId = z.string().min(1).safeParse(assetId);
  const parsedRating = ratingSchema.safeParse(rating);
  if (!parsedId.success || !parsedRating.success) {
    return { error: "Ungültiges Rating." };
  }
  const owned = await ownedStagingAssets(session.user.id, [parsedId.data]);
  if (!owned.has(parsedId.data)) {
    return { error: "Bild nicht gefunden." };
  }
  await prisma.asset.update({
    where: { id: parsedId.data },
    data: { rating: parsedRating.data },
  });
  revalidateDam();
  return {};
}

export async function rejectAssets(
  assetIds: string[],
): Promise<{ error?: string; count?: number }> {
  const { session } = await requireMembership();
  const parsed = idsSchema.safeParse(assetIds);
  if (!parsed.success) return { error: "Keine Bilder gewählt." };
  const owned = await ownedStagingAssets(session.user.id, parsed.data);
  const ids = parsed.data.filter((id) => owned.has(id));
  if (ids.length === 0) return { error: "Bild nicht gefunden." };
  await prisma.asset.updateMany({
    where: { id: { in: ids }, uploadedBy: session.user.id, status: "staging" },
    data: { status: "rejected" },
  });
  revalidateDam();
  return { count: ids.length };
}

const editSchema = z.object({
  brightness: z.number().min(50).max(200).optional(),
  saturation: z.number().min(50).max(200).optional(),
  contrast: z.number().min(50).max(200).optional(),
  rotate: z.number().min(0).max(360).optional(),
  flipHorizontal: z.boolean().optional(),
  flipVertical: z.boolean().optional(),
  crop: z
    .object({
      unit: z.literal("%"),
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      width: z.number().min(0).max(100),
      height: z.number().min(0).max(100),
    })
    .nullable()
    .optional(),
  aspectRatio: z
    .enum(["free", "1:1", "16:9", "4:3", "3:2"])
    .nullable()
    .optional(),
  sharpen: z.number().min(0).max(100).optional(),
  temperature: z.number().min(-100).max(100).optional(),
});

export async function saveAssetEditParams(
  assetId: string,
  raw: unknown,
): Promise<{ error?: string }> {
  const { session } = await requireMembership();
  const parsedId = z.string().min(1).safeParse(assetId);
  const parsed = editSchema.safeParse(raw);
  if (!parsedId.success || !parsed.success) {
    return { error: "Ungültige Edit-Werte." };
  }
  const owned = await ownedStagingAssets(session.user.id, [parsedId.data]);
  if (!owned.has(parsedId.data)) {
    return { error: "Bild nicht gefunden." };
  }
  const params = parseEditParams(parsed.data);
  await prisma.asset.update({
    where: { id: parsedId.data },
    data: { editParams: params as unknown as Prisma.InputJsonValue },
  });
  revalidateDam();
  return {};
}

export async function createDamCollection(
  name: string,
  options?: { isPersonal?: boolean },
): Promise<{ error?: string; collection?: { id: string; name: string } }> {
  const { session } = await requireMembership();
  const parsed = z.string().trim().min(1).max(120).safeParse(name);
  if (!parsed.success) return { error: "Collection-Name fehlt." };
  const collection = await prisma.collection.create({
    data: {
      name: parsed.data,
      createdBy: session.user.id,
      isPersonal: options?.isPersonal ?? true,
    },
    select: { id: true, name: true },
  });
  revalidateDam();
  return { collection };
}

export async function deleteDamCollections(
  collectionIds: string[],
): Promise<{ error?: string; count?: number; names?: string[]; ids?: string[] }> {
  await requireMembership();
  const parsed = z.array(z.string().min(1)).min(1).max(50).safeParse(collectionIds);
  if (!parsed.success) return { error: "Keine Collection gewählt." };
  const rows = await prisma.collection.findMany({
    where: { id: { in: parsed.data } },
    select: { id: true, name: true },
  });
  if (rows.length === 0) return { error: "Collection nicht gefunden." };
  const ids = rows.map((row) => row.id);
  await prisma.collection.deleteMany({
    where: { id: { in: ids } },
  });
  revalidateDam();
  return { count: rows.length, names: rows.map((row) => row.name), ids };
}

export async function assignAssetsToCollection(input: {
  assetIds: string[];
  collectionId?: string;
  newName?: string;
}): Promise<{ error?: string; collectionId?: string }> {
  const { session } = await requireMembership();
  const parsedIds = idsSchema.safeParse(input.assetIds);
  if (!parsedIds.success) return { error: "Keine Bilder gewählt." };
  const owned = await editableAssets(session.user.id, parsedIds.data);
  const ids = parsedIds.data.filter((id) => owned.has(id));
  if (ids.length === 0) return { error: "Bild nicht gefunden." };

  const newName = input.newName?.trim() ?? "";
  let collectionId = input.collectionId?.trim() || "";
  if (newName) {
    const created = await prisma.collection.create({
      data: {
        name: newName.slice(0, 120),
        createdBy: session.user.id,
        isPersonal: true,
      },
      select: { id: true },
    });
    collectionId = created.id;
  }
  if (!collectionId) return { error: "Collection wählen oder neu anlegen." };

  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { id: true },
  });
  if (!collection) return { error: "Collection nicht gefunden." };

  await prisma.assetCollection.createMany({
    data: ids.map((assetId) => ({ assetId, collectionId })),
    skipDuplicates: true,
  });
  revalidateDam();
  return { collectionId };
}

export async function removeAssetsFromCollection(input: {
  assetIds: string[];
  collectionId: string;
}): Promise<{ error?: string }> {
  const { session } = await requireMembership();
  const parsedIds = idsSchema.safeParse(input.assetIds);
  const collectionId = input.collectionId?.trim() ?? "";
  if (!parsedIds.success || !collectionId) {
    return { error: "Keine Bilder oder Collection gewählt." };
  }
  const owned = await editableAssets(session.user.id, parsedIds.data);
  const ids = parsedIds.data.filter((id) => owned.has(id));
  if (ids.length === 0) return { error: "Bild nicht gefunden." };

  await prisma.assetCollection.deleteMany({
    where: {
      collectionId,
      assetId: { in: ids },
    },
  });
  revalidateDam();
  return {};
}

const rightsSchema = z.enum(["own", "provided", "free_use"]);
const metadataSchema = z
  .object({
    fileName: z.string().trim().min(1).max(240).optional(),
    credit: z.string().trim().min(1).max(200).optional(),
    rightsType: rightsSchema.optional(),
    altText: z.string().trim().max(240).nullable().optional(),
    keywords: z.array(z.string().trim().min(1).max(60)).max(24).optional(),
    notes: z.string().max(4000).nullable().optional(),
    takenAt: z.string().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Keine Änderungen.",
  });

const idListSchema = z.array(z.string().min(1)).max(20);
const keywordListSchema = z.array(z.string().trim().min(1).max(60)).max(24);
const bulkPublishedSchema = z
  .object({
    assetIds: idsSchema,
    credit: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(4000).nullable().optional(),
    addKeywords: keywordListSchema.optional(),
    removeKeywords: keywordListSchema.optional(),
    addCollectionIds: idListSchema.optional(),
    removeCollectionIds: idListSchema.optional(),
  })
  .refine(
    (value) =>
      value.credit !== undefined ||
      value.notes !== undefined ||
      (value.addKeywords?.length ?? 0) > 0 ||
      (value.removeKeywords?.length ?? 0) > 0 ||
      (value.addCollectionIds?.length ?? 0) > 0 ||
      (value.removeCollectionIds?.length ?? 0) > 0,
    { message: "Keine Änderungen." },
  );

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function bulkUpdatePublishedAssets(
  input: unknown,
): Promise<{ error?: string; count?: number }> {
  await requireMembership();
  const parsed = bulkPublishedSchema.safeParse(input);
  if (!parsed.success) return { error: "Ungültige Änderungen." };

  const addKeywords = uniqueKeywords(parsed.data.addKeywords ?? []);
  const removeKeywords = uniqueKeywords(parsed.data.removeKeywords ?? []);
  const addCollectionIds = uniqueIds(parsed.data.addCollectionIds ?? []).filter(
    (id) => !(parsed.data.removeCollectionIds ?? []).includes(id),
  );
  const removeCollectionIds = uniqueIds(parsed.data.removeCollectionIds ?? []).filter(
    (id) => !addCollectionIds.includes(id),
  );
  const collectionIds = [...addCollectionIds, ...removeCollectionIds];
  const credit = parsed.data.credit;
  const notes =
    parsed.data.notes === undefined
      ? undefined
      : parsed.data.notes?.trim()
        ? parsed.data.notes.trim().slice(0, 4000)
        : null;
  const touchKeywords = addKeywords.length > 0 || removeKeywords.length > 0;
  const touchFields = credit !== undefined || notes !== undefined;

  const rows = await prisma.asset.findMany({
    where: { id: { in: parsed.data.assetIds }, status: "published" },
    select: { id: true, keywords: true },
  });
  if (rows.length === 0) return { error: "Bild nicht gefunden." };
  const ids = rows.map((row) => row.id);

  if (collectionIds.length > 0) {
    const found = await prisma.collection.count({
      where: { id: { in: collectionIds } },
    });
    if (found !== collectionIds.length) {
      return { error: "Collection nicht gefunden." };
    }
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        if (addCollectionIds.length > 0) {
          await tx.assetCollection.createMany({
            data: ids.flatMap((assetId) =>
              addCollectionIds.map((collectionId) => ({ assetId, collectionId })),
            ),
            skipDuplicates: true,
          });
        }
        if (removeCollectionIds.length > 0) {
          await tx.assetCollection.deleteMany({
            where: {
              collectionId: { in: removeCollectionIds },
              assetId: { in: ids },
            },
          });
        }

        if (touchKeywords) {
          for (const row of rows) {
            const keywords = applyKeywordChanges(
              row.keywords,
              addKeywords,
              removeKeywords,
            );
            const keywordsUnchanged =
              keywords.length === row.keywords.length &&
              keywords.every((keyword, index) => keyword === row.keywords[index]);
            if (keywordsUnchanged && !touchFields) continue;
            await tx.asset.update({
              where: { id: row.id },
              data: {
                keywords,
                ...(credit !== undefined ? { credit } : {}),
                ...(notes !== undefined ? { notes } : {}),
              },
            });
          }
        } else if (touchFields) {
          await tx.asset.updateMany({
            where: { id: { in: ids }, status: "published" },
            data: {
              ...(credit !== undefined ? { credit } : {}),
              ...(notes !== undefined ? { notes } : {}),
            },
          });
        }
      },
      { timeout: 30_000 },
    );
  } catch {
    return { error: "Änderungen konnten nicht gespeichert werden." };
  }

  revalidateDam();
  return { count: ids.length };
}

export async function updateAssetMetadata(
  assetId: string,
  patch: unknown,
): Promise<{ error?: string }> {
  const { session } = await requireMembership();
  const parsedId = z.string().min(1).safeParse(assetId);
  const parsed = metadataSchema.safeParse(patch);
  if (!parsedId.success || !parsed.success) {
    return { error: "Ungültige Metadaten." };
  }
  const owned = await editableAssets(session.user.id, [parsedId.data]);
  if (!owned.has(parsedId.data)) {
    return { error: "Bild nicht gefunden." };
  }

  const data: Prisma.AssetUpdateInput = {};
  if (parsed.data.fileName !== undefined) {
    const fileName = parsed.data.fileName.replace(/[/\\]/g, "");
    if (!fileName) return { error: "Ungültiger Dateiname." };
    data.fileName = fileName;
  }
  if (parsed.data.credit !== undefined) data.credit = parsed.data.credit;
  if (parsed.data.rightsType !== undefined) data.rightsType = parsed.data.rightsType;
  if (parsed.data.altText !== undefined) {
    data.altText = parsed.data.altText?.trim() ? parsed.data.altText.trim() : null;
  }
  if (parsed.data.keywords !== undefined) {
    data.keywords = uniqueKeywords(parsed.data.keywords);
  }
  if (parsed.data.notes !== undefined) {
    const notes = parsed.data.notes?.trim() ?? "";
    data.notes = notes ? notes.slice(0, 4000) : null;
  }
  if (parsed.data.takenAt !== undefined) {
    if (parsed.data.takenAt === null || parsed.data.takenAt.trim() === "") {
      data.takenAt = null;
    } else {
      const takenAt = new Date(parsed.data.takenAt);
      if (Number.isNaN(takenAt.getTime())) {
        return { error: "Ungültiges Datum." };
      }
      data.takenAt = takenAt;
    }
  }

  await prisma.asset.update({
    where: { id: parsedId.data },
    data,
  });
  revalidateDam();
  return {};
}

const publishItemSchema = z.object({
  assetId: z.string().min(1),
  altText: z.string().trim().min(1).max(240),
  collectionIds: z.array(z.string().trim().min(1)).min(1).max(20),
});

export async function publishAssets(
  items: unknown,
): Promise<{
  error?: string;
  publishedIds?: string[];
  errors?: { assetId: string; error: string }[];
}> {
  const { session } = await requireMembership();
  const parsed = z.array(publishItemSchema).min(1).max(200).safeParse(items);
  if (!parsed.success) {
    return { error: "Alt-Text und Collection sind Pflicht." };
  }
  const owned = await ownedStagingAssets(
    session.user.id,
    parsed.data.map((item) => item.assetId),
  );
  const toPublish = parsed.data.filter((item) => owned.has(item.assetId));
  if (toPublish.length === 0) return { error: "Bild nicht gefunden." };

  const result = await publishDamAssets(session.user.id, toPublish);
  revalidateDam();
  if (result.publishedIds.length === 0) {
    return {
      error: result.errors[0]?.error ?? "Publizieren fehlgeschlagen.",
      publishedIds: [],
      errors: result.errors,
    };
  }
  return result;
}

export async function moveAssetsToTrash(
  assetIds: string[],
): Promise<{ error?: string; ids?: string[] }> {
  const { session } = await requireMembership();
  const parsed = idsSchema.safeParse(assetIds);
  if (!parsed.success) return { error: "Keine Bilder gewählt." };
  const { movePublishedAssetsToTrash } = await import("@/lib/dam/trash");
  const result = await movePublishedAssetsToTrash(session.user.id, parsed.data);
  if (result.error) return { error: result.error };
  revalidateDam();
  return { ids: result.ids };
}

export async function restoreAssetsFromTrash(
  assetIds: string[],
): Promise<{ error?: string; ids?: string[] }> {
  const { session } = await requireMembership();
  const parsed = idsSchema.safeParse(assetIds);
  if (!parsed.success) return { error: "Keine Bilder gewählt." };
  const { restoreTrashedAssets } = await import("@/lib/dam/trash");
  const result = await restoreTrashedAssets(session.user.id, parsed.data);
  if (result.error) return { error: result.error };
  revalidateDam();
  return { ids: result.ids };
}

export async function purgeAsset(
  assetId: string,
): Promise<{ error?: string }> {
  const { session } = await requireMembership();
  const parsedId = z.string().min(1).safeParse(assetId);
  if (!parsedId.success) return { error: "Bild nicht gefunden." };
  const { purgeAssetById } = await import("@/lib/dam/trash");
  const result = await purgeAssetById(session.user.id, parsedId.data);
  if (result.error) return result;
  revalidateDam();
  return {};
}
