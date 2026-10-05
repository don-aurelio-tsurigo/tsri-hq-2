import type { AssetStatus, Prisma } from "@/generated/prisma/client";
import type { FaceBox } from "@/lib/dam/face-rekognition";
import { prisma } from "@/lib/db";

export const FACE_PAGE_SIZE = 120;

/** Archive for everyone, staging only for the uploader, never trashed. */
export function visibleAssetWhere(userId: string): Prisma.AssetWhereInput {
  return {
    deletedAt: null,
    OR: [{ status: "published" }, { status: "staging", uploadedBy: userId }],
  };
}

export type PersonCard = {
  id: string;
  name: string;
  photoCount: number;
  suggestionCount: number;
  avatarFaceId: string | null;
};

export type FaceTile = { id: string; assetId: string; box: FaceBox };

export async function faceTabCounts(userId: string) {
  const asset = visibleAssetWhere(userId);
  const [persons, unassigned, ignored] = await Promise.all([
    prisma.damPerson.count(),
    prisma.assetFace.count({ where: { status: "unassigned", asset } }),
    prisma.assetFace.count({ where: { status: "ignored", asset } }),
  ]);
  return { persons, unassigned, ignored };
}

export async function listPersonCards(userId: string): Promise<PersonCard[]> {
  const asset = visibleAssetWhere(userId);
  const persons = await prisma.damPerson.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          assets: { where: { asset } },
          faces: { where: { status: "suggested", asset } },
        },
      },
      faces: {
        where: { status: "confirmed", asset },
        orderBy: [{ associated: "desc" }, { sharpness: "desc" }],
        take: 1,
        select: { id: true },
      },
    },
  });
  return persons.map((person) => ({
    id: person.id,
    name: person.name,
    photoCount: person._count.assets,
    suggestionCount: person._count.faces,
    avatarFaceId: person.faces[0]?.id ?? null,
  }));
}

export async function listFaceTiles(
  userId: string,
  status: "unassigned" | "ignored",
  page: number,
): Promise<FaceTile[]> {
  return prisma.assetFace.findMany({
    where: { status, asset: visibleAssetWhere(userId) },
    // Sharp faces first: most likely someone worth naming.
    orderBy: [{ sharpness: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: Math.max(0, page - 1) * FACE_PAGE_SIZE,
    take: FACE_PAGE_SIZE,
    select: { id: true, assetId: true, box: true },
  }).then((rows) => rows.map((row) => ({ ...row, box: row.box as FaceBox })));
}

export type PersonDetail = {
  id: string;
  name: string;
  photos: { assetId: string; fileName: string; status: AssetStatus }[];
  suggestions: (FaceTile & { similarity: number | null })[];
  references: FaceTile[];
};

export async function loadPersonDetail(
  userId: string,
  personId: string,
): Promise<PersonDetail | null> {
  const asset = visibleAssetWhere(userId);
  const person = await prisma.damPerson.findUnique({
    where: { id: personId },
    select: {
      id: true,
      name: true,
      assets: {
        where: { asset },
        orderBy: { asset: { createdAt: "desc" } },
        select: { asset: { select: { id: true, fileName: true, status: true } } },
      },
      faces: {
        where: { asset, OR: [{ status: "suggested" }, { associated: true }] },
        orderBy: { similarity: { sort: "desc", nulls: "last" } },
        select: {
          id: true,
          assetId: true,
          box: true,
          status: true,
          similarity: true,
          associated: true,
        },
      },
    },
  });
  if (!person) return null;
  return {
    id: person.id,
    name: person.name,
    photos: person.assets.map((link) => ({
      assetId: link.asset.id,
      fileName: link.asset.fileName,
      status: link.asset.status,
    })),
    suggestions: person.faces
      .filter((face) => face.status === "suggested")
      .map((face) => ({
        id: face.id,
        assetId: face.assetId,
        box: face.box as FaceBox,
        similarity: face.similarity,
      })),
    references: person.faces
      .filter((face) => face.associated)
      .map((face) => ({ id: face.id, assetId: face.assetId, box: face.box as FaceBox })),
  };
}

/** Face ids the user may change (asset visible + editable). */
export async function editableFaceIds(userId: string, faceIds: string[]): Promise<string[]> {
  if (faceIds.length === 0) return [];
  const rows = await prisma.assetFace.findMany({
    where: { id: { in: faceIds }, asset: visibleAssetWhere(userId) },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
