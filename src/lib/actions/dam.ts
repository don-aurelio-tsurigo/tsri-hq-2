"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { parseEditParams } from "@/lib/dam/edit-params";
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

export async function assignAssetsToCollection(input: {
  assetIds: string[];
  collectionId?: string;
  newName?: string;
}): Promise<{ error?: string; collectionId?: string }> {
  const { session } = await requireMembership();
  const parsedIds = idsSchema.safeParse(input.assetIds);
  if (!parsedIds.success) return { error: "Keine Bilder gewählt." };
  const owned = await ownedStagingAssets(session.user.id, parsedIds.data);
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
  const owned = await ownedStagingAssets(session.user.id, parsedIds.data);
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
    takenAt: z.string().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Keine Änderungen.",
  });

function uniqueKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const keyword = raw.trim();
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out.slice(0, 24);
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
  const owned = await ownedStagingAssets(session.user.id, [parsedId.data]);
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
    return { error: "Alt-Text ist Pflicht. Bitte alle Felder ausfüllen." };
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
