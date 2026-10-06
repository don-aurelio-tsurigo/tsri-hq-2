import sharp from "sharp";
import type { FaceScanStatus } from "@/generated/prisma/client";
import { looksLikeImageBytes } from "@/lib/dam/accept";
import { jpegForAutotag } from "@/lib/dam/autotag";
import { syncAssetPersons } from "@/lib/dam/face-persons";
import {
  deleteFaces,
  faceSettings,
  indexFaces,
  isMissingUser,
  rekognitionConfigured,
  searchUsersByFace,
  type FaceBox,
} from "@/lib/dam/face-rekognition";
import { faceCropKey } from "@/lib/dam/r2-keys";
import { prisma } from "@/lib/db";
import { deleteObject, getObject, putObject } from "@/lib/r2";

const CROP_SIZE = 192;
const CROP_PADDING = 0.3;

/** Scan step, attached to thrown errors for the log («failed at search»). */
export type FaceScanStage = "load" | "index" | "search" | "store";

export function faceScanStage(error: unknown): FaceScanStage | undefined {
  return (error as { faceScanStage?: FaceScanStage } | null)?.faceScanStage;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A just-indexed face is sometimes not yet searchable; Rekognition then answers
 * InvalidParameterException. Retry briefly before giving up.
 */
async function searchUsersWithRetry(faceId: string, minSimilarity: number) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await searchUsersByFace(faceId, minSimilarity);
    } catch (error) {
      if (attempt >= 2 || !isMissingUser(error)) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}

export type FaceScanResult = {
  status: "done" | "skipped";
  faces: number;
  confirmed: number;
  suggested: number;
};

/** Status-only write; keeps asset.updatedAt (used by the rejected purge) untouched. */
export async function setFaceStatus(assetIds: string[], status: FaceScanStatus): Promise<void> {
  if (assetIds.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "asset"
    SET "faceStatus" = ${status}::"FaceScanStatus", "faceScannedAt" = NOW()
    WHERE "id" = ANY(${assetIds})
  `;
}

function cropRegion(box: FaceBox, width: number, height: number) {
  const size = Math.min(
    Math.round(Math.max(box.width * width, box.height * height) * (1 + 2 * CROP_PADDING)),
    width,
    height,
  );
  const centerX = (box.left + box.width / 2) * width;
  const centerY = (box.top + box.height / 2) * height;
  const left = Math.min(Math.max(0, Math.round(centerX - size / 2)), width - size);
  const top = Math.min(Math.max(0, Math.round(centerY - size / 2)), height - size);
  return { left, top, width: size, height: size };
}

async function writeFaceCrops(
  jpeg: Buffer,
  faces: { id: string; box: FaceBox }[],
): Promise<void> {
  const meta = await sharp(jpeg).metadata();
  if (!meta.width || !meta.height) return;
  for (const face of faces) {
    try {
      const crop = await sharp(jpeg)
        .extract(cropRegion(face.box, meta.width, meta.height))
        .resize(CROP_SIZE, CROP_SIZE, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();
      await putObject(faceCropKey(face.id), crop, "image/webp");
    } catch (error) {
      console.warn(`[dam-face] crop failed for ${face.id}`, error);
    }
  }
}

/**
 * Detects and indexes faces of one asset, matches them against known persons
 * and stores AssetFace rows + crop thumbnails. Boxes refer to the EXIF-rotated
 * master (same orientation as all derivatives), not to editParams.
 */
export async function scanAssetFaces(assetId: string): Promise<FaceScanResult> {
  const stage: { current: FaceScanStage } = { current: "load" };
  try {
    return await scanAssetFacesInner(assetId, stage);
  } catch (error) {
    if (error && typeof error === "object") {
      Object.assign(error, { faceScanStage: stage.current });
    }
    throw error;
  }
}

async function scanAssetFacesInner(
  assetId: string,
  stage: { current: FaceScanStage },
): Promise<FaceScanResult> {
  const empty = { faces: 0, confirmed: 0, suggested: 0 };
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      r2Key: true,
      status: true,
      deletedAt: true,
      _count: { select: { faces: true } },
    },
  });
  if (!asset || asset.deletedAt || (asset.status !== "staging" && asset.status !== "published")) {
    if (asset) await setFaceStatus([assetId], "skipped");
    return { status: "skipped", ...empty };
  }
  if (asset._count.faces > 0) {
    await setFaceStatus([assetId], "done");
    return { status: "done", ...empty };
  }

  const { buffer } = await getObject(asset.r2Key);
  if (!looksLikeImageBytes(buffer)) {
    await setFaceStatus([assetId], "skipped");
    return { status: "skipped", ...empty };
  }

  const settings = faceSettings();
  const jpeg = await jpegForAutotag(buffer);
  stage.current = "index";
  const indexed = await indexFaces(jpeg, asset.id, settings.maxPerImage);
  const keep = indexed.filter((face) => face.box.height >= settings.minBoxSize);
  const tooSmall = indexed.filter((face) => face.box.height < settings.minBoxSize);
  if (tooSmall.length > 0) await deleteFaces(tooSmall.map((face) => face.faceId));
  if (keep.length === 0) {
    await setFaceStatus([assetId], "done");
    return { status: "done", ...empty };
  }

  try {
    stage.current = "search";
    const bestMatch = new Map<string, { userId: string; similarity: number }>();
    for (const face of keep) {
      const [top] = await searchUsersWithRetry(face.faceId, settings.suggestSimilarity);
      if (top) bestMatch.set(face.faceId, top);
    }
    stage.current = "store";
    const persons = await prisma.damPerson.findMany({
      where: { rekognitionUserId: { in: [...bestMatch.values()].map((match) => match.userId) } },
      select: { id: true, rekognitionUserId: true },
    });
    const personByUser = new Map(persons.map((person) => [person.rekognitionUserId, person.id]));

    const rows = keep.map((face) => {
      const match = bestMatch.get(face.faceId);
      const personId = match ? personByUser.get(match.userId) : undefined;
      const status = !match || !personId
        ? ("unassigned" as const)
        : match.similarity >= settings.autoMatchSimilarity
          ? ("confirmed" as const)
          : ("suggested" as const);
      return {
        assetId: asset.id,
        rekognitionFaceId: face.faceId,
        box: face.box,
        confidence: face.confidence,
        sharpness: face.sharpness,
        status,
        personId: status === "unassigned" ? null : personId,
        similarity: status === "unassigned" ? null : match!.similarity,
      };
    });

    const created = await prisma.assetFace.createManyAndReturn({
      data: rows,
      select: { id: true, rekognitionFaceId: true },
    });
    const boxByFaceId = new Map(keep.map((face) => [face.faceId, face.box]));
    await writeFaceCrops(
      jpeg,
      created.map((row) => ({ id: row.id, box: boxByFaceId.get(row.rekognitionFaceId!)! })),
    );

    const confirmed = rows.filter((row) => row.status === "confirmed").length;
    const suggested = rows.filter((row) => row.status === "suggested").length;
    if (confirmed > 0) await syncAssetPersons(asset.id);
    await setFaceStatus([assetId], "done");
    return { status: "done", faces: rows.length, confirmed, suggested };
  } catch (error) {
    // No DB rows → don't leave orphaned biometric data in the collection.
    const stored = await prisma.assetFace.count({ where: { assetId } });
    if (stored === 0) {
      await deleteFaces(keep.map((face) => face.faceId)).catch((cleanupError) =>
        console.warn(`[dam-face] cleanup failed for ${assetId}`, cleanupError),
      );
    }
    throw error;
  }
}

/**
 * Removes an asset's faces from Rekognition and its crop thumbnails.
 * Call before deleting the asset row (AssetFace rows cascade).
 */
export async function deleteAssetFaceData(assetIds: string[]): Promise<void> {
  if (assetIds.length === 0) return;
  const faces = await prisma.assetFace.findMany({
    where: { assetId: { in: assetIds } },
    select: { id: true, rekognitionFaceId: true },
  });
  if (faces.length === 0) return;
  const faceIds = faces.flatMap((face) => (face.rekognitionFaceId ? [face.rekognitionFaceId] : []));
  if (faceIds.length > 0) {
    if (!rekognitionConfigured()) {
      throw new Error("Gesichtsdaten können nicht gelöscht werden: Rekognition nicht konfiguriert.");
    }
    await deleteFaces(faceIds);
  }
  await Promise.allSettled(faces.map((face) => deleteObject(faceCropKey(face.id))));
}
