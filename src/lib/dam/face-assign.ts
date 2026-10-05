import { randomUUID } from "node:crypto";
import type { FaceMatchStatus, FaceScanStatus } from "@/generated/prisma/client";
import { syncAssetPersons } from "@/lib/dam/face-persons";
import {
  associateFacesToUser,
  deletePersonUser,
  disassociateFacesFromUser,
  faceSettings,
  rekognitionConfigured,
  searchFacesByFace,
  type FaceBox,
} from "@/lib/dam/face-rekognition";
import { ASSET_KEYWORD_LENGTH } from "@/lib/dam/keywords";
import { prisma } from "@/lib/db";

export type AssetFaceView = {
  id: string;
  box: FaceBox;
  status: FaceMatchStatus;
  personId: string | null;
  personName: string | null;
  similarity: number | null;
};

export type AssetPersonView = { id: string; name: string; source: "face" | "manual" };

export type AssetFacesState = {
  faceStatus: FaceScanStatus;
  faces: AssetFaceView[];
  persons: AssetPersonView[];
  keywords: string[];
};

export type PersonInput = { personId: string } | { name: string };

export class FaceActionError extends Error {}

/** Same rule as metadata edits: archive for everyone, staging only for the uploader. */
export async function canEditAssetFaces(userId: string, assetId: string): Promise<boolean> {
  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      OR: [{ status: "published" }, { status: "staging", uploadedBy: userId }],
    },
    select: { id: true },
  });
  return Boolean(asset);
}

export async function loadAssetFacesState(assetId: string): Promise<AssetFacesState | null> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      faceStatus: true,
      keywords: true,
      faces: {
        where: { status: { not: "rejected" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          box: true,
          status: true,
          personId: true,
          similarity: true,
          person: { select: { name: true } },
        },
      },
      persons: {
        orderBy: { createdAt: "asc" },
        select: { source: true, person: { select: { id: true, name: true } } },
      },
    },
  });
  if (!asset) return null;
  return {
    faceStatus: asset.faceStatus,
    keywords: asset.keywords,
    faces: asset.faces.map((face) => ({
      id: face.id,
      box: face.box as FaceBox,
      status: face.status,
      personId: face.personId,
      personName: face.person?.name ?? null,
      similarity: face.similarity,
    })),
    persons: asset.persons.map((link) => ({
      id: link.person.id,
      name: link.person.name,
      source: link.source,
    })),
  };
}

export async function listDamPersons(): Promise<{ id: string; name: string }[]> {
  return prisma.damPerson.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, ASSET_KEYWORD_LENGTH);
}

async function findOrCreatePerson(userId: string, input: PersonInput) {
  const select = { id: true, name: true, rekognitionUserId: true } as const;
  if ("personId" in input) {
    const person = await prisma.damPerson.findUnique({ where: { id: input.personId }, select });
    if (!person) throw new FaceActionError("Person nicht gefunden.");
    return person;
  }
  const name = normalizeName(input.name);
  if (!name) throw new FaceActionError("Name fehlt.");
  const existing = await prisma.damPerson.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select,
  });
  if (existing) return existing;
  try {
    return await prisma.damPerson.create({
      data: { name, rekognitionUserId: `p-${randomUUID()}`, createdBy: userId },
      select,
    });
  } catch {
    // Parallel create with the same name → use the winner.
    const winner = await prisma.damPerson.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select,
    });
    if (!winner) throw new FaceActionError("Person konnte nicht angelegt werden.");
    return winner;
  }
}

async function loadFace(faceId: string) {
  const face = await prisma.assetFace.findUnique({
    where: { id: faceId },
    select: {
      id: true,
      assetId: true,
      status: true,
      personId: true,
      associated: true,
      rekognitionFaceId: true,
      rejectedPersonIds: true,
      person: { select: { rekognitionUserId: true } },
    },
  });
  if (!face) throw new FaceActionError("Gesicht nicht gefunden.");
  return face;
}

/** Removes a face from its person's reference set in Rekognition. */
async function detachReference(face: Awaited<ReturnType<typeof loadFace>>): Promise<void> {
  if (!face.associated || !face.rekognitionFaceId || !face.person) return;
  await disassociateFacesFromUser(face.person.rekognitionUserId, [face.rekognitionFaceId]);
  await prisma.assetFace.update({ where: { id: face.id }, data: { associated: false } });
}

/** Adds a manually confirmed face as reference for the person (better future matches). */
async function attachReference(
  faceId: string,
  rekognitionFaceId: string | null,
  rekognitionUserId: string,
): Promise<void> {
  if (!rekognitionFaceId || !rekognitionConfigured()) return;
  try {
    const result = await associateFacesToUser(rekognitionUserId, [rekognitionFaceId]);
    if (result.associated.includes(rekognitionFaceId)) {
      await prisma.assetFace.update({ where: { id: faceId }, data: { associated: true } });
    }
  } catch (error) {
    // Only improves future matching — the assignment itself already succeeded.
    console.warn(`[dam-face] could not add reference face ${faceId}`, error);
  }
}

/**
 * Finds the newly named person in all other photos: high similarity is
 * confirmed directly, the rest becomes a suggestion. Returns changed faces.
 */
async function propagatePerson(personId: string, rekognitionFaceId: string | null) {
  if (!rekognitionFaceId || !rekognitionConfigured()) return { confirmed: 0, suggested: 0 };
  const settings = faceSettings();
  const matches = await searchFacesByFace(rekognitionFaceId, settings.suggestSimilarity);
  if (matches.length === 0) return { confirmed: 0, suggested: 0 };
  const similarityByFace = new Map(matches.map((match) => [match.faceId, match.similarity]));

  const candidates = await prisma.assetFace.findMany({
    where: {
      rekognitionFaceId: { in: [...similarityByFace.keys()] },
      status: { in: ["unassigned", "suggested"] },
      NOT: { rejectedPersonIds: { has: personId } },
    },
    select: { id: true, assetId: true, status: true, similarity: true, rekognitionFaceId: true },
  });

  let confirmed = 0;
  let suggested = 0;
  const confirmedAssets = new Set<string>();
  for (const candidate of candidates) {
    const similarity = similarityByFace.get(candidate.rekognitionFaceId!)!;
    if (similarity >= settings.autoMatchSimilarity) {
      await prisma.assetFace.update({
        where: { id: candidate.id },
        data: { status: "confirmed", personId, similarity, assignedBy: null },
      });
      confirmed += 1;
      confirmedAssets.add(candidate.assetId);
    } else if (
      candidate.status === "unassigned" ||
      (candidate.similarity ?? 0) < similarity
    ) {
      await prisma.assetFace.update({
        where: { id: candidate.id },
        data: { status: "suggested", personId, similarity },
      });
      suggested += 1;
    }
  }
  for (const assetId of confirmedAssets) await syncAssetPersons(assetId);
  return { confirmed, suggested };
}

/**
 * Name a face (existing or new person) and search the archive for the same person.
 * Bulk confirmations skip the search (`propagate: false`) to stay within AWS rate limits.
 */
export async function assignFace(
  userId: string,
  faceId: string,
  input: PersonInput,
  { propagate = true }: { propagate?: boolean } = {},
) {
  const face = await loadFace(faceId);
  const person = await findOrCreatePerson(userId, input);
  if (face.personId && face.personId !== person.id) await detachReference(face);

  await prisma.assetFace.update({
    where: { id: face.id },
    data: {
      status: "confirmed",
      personId: person.id,
      assignedBy: userId,
      rejectedPersonIds: face.rejectedPersonIds.filter((id) => id !== person.id),
    },
  });
  await syncAssetPersons(face.assetId);
  await attachReference(face.id, face.rekognitionFaceId, person.rekognitionUserId);
  const propagated = propagate
    ? await propagatePerson(person.id, face.rekognitionFaceId)
    : { confirmed: 0, suggested: 0 };
  return { assetId: face.assetId, person, propagated };
}

/** «Nein, das ist nicht X» — X will not be suggested for this face again. */
export async function rejectFace(faceId: string) {
  const face = await loadFace(faceId);
  await detachReference(face);
  await prisma.assetFace.update({
    where: { id: face.id },
    data: {
      status: "unassigned",
      personId: null,
      similarity: null,
      assignedBy: null,
      rejectedPersonIds: face.personId
        ? [...new Set([...face.rejectedPersonIds, face.personId])]
        : face.rejectedPersonIds,
    },
  });
  await syncAssetPersons(face.assetId);
  return { assetId: face.assetId };
}

/** Background face / crowd: hide from the overlay and from suggestions. */
export async function ignoreFace(faceId: string) {
  const face = await loadFace(faceId);
  await detachReference(face);
  await prisma.assetFace.update({
    where: { id: face.id },
    data: { status: "ignored", personId: null, similarity: null, assignedBy: null },
  });
  await syncAssetPersons(face.assetId);
  return { assetId: face.assetId };
}

export async function unignoreFace(faceId: string) {
  const face = await loadFace(faceId);
  if (face.status !== "ignored") return { assetId: face.assetId };
  await prisma.assetFace.update({ where: { id: face.id }, data: { status: "unassigned" } });
  return { assetId: face.assetId };
}

/** «Personen» field: add someone without (visible) face, e.g. seen from behind. */
export async function addManualPerson(userId: string, assetId: string, input: PersonInput) {
  const person = await findOrCreatePerson(userId, input);
  await prisma.assetPerson.createMany({
    data: [{ assetId, personId: person.id, source: "manual" }],
    skipDuplicates: true,
  });
  await syncAssetPersons(assetId);
  return { person };
}

/** Remove a person from the asset; matching faces count as «not this person». */
export async function removeAssetPerson(assetId: string, personId: string) {
  const person = await prisma.damPerson.findUnique({
    where: { id: personId },
    select: { name: true },
  });
  const faces = await prisma.assetFace.findMany({
    where: { assetId, personId, status: { in: ["confirmed", "suggested"] } },
    select: { id: true },
  });
  for (const face of faces) await rejectFace(face.id);
  await prisma.assetPerson.deleteMany({ where: { assetId, personId } });
  await syncAssetPersons(assetId, person ? [person.name] : []);
}

/** Rename everywhere: person, «Personen» field and keywords of all linked assets. */
export async function renamePerson(personId: string, rawName: string) {
  const name = normalizeName(rawName);
  if (!name) throw new FaceActionError("Name fehlt.");
  const person = await prisma.damPerson.findUnique({
    where: { id: personId },
    select: { name: true, assets: { select: { assetId: true } } },
  });
  if (!person) throw new FaceActionError("Person nicht gefunden.");
  if (person.name === name) return;
  const clash = await prisma.damPerson.findFirst({
    where: { id: { not: personId }, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) throw new FaceActionError(`«${name}» gibt es schon.`);
  await prisma.damPerson.update({ where: { id: personId }, data: { name } });
  for (const link of person.assets) await syncAssetPersons(link.assetId, [person.name]);
}

/**
 * Deletes the person and its Rekognition user. Faces stay detected but become
 * unnamed again; the name is removed from all keywords.
 */
export async function deletePerson(personId: string) {
  const person = await prisma.damPerson.findUnique({
    where: { id: personId },
    select: {
      name: true,
      rekognitionUserId: true,
      assets: { select: { assetId: true } },
    },
  });
  if (!person) return;
  if (rekognitionConfigured()) await deletePersonUser(person.rekognitionUserId);
  await prisma.assetFace.updateMany({
    where: { personId },
    data: {
      status: "unassigned",
      personId: null,
      similarity: null,
      assignedBy: null,
      associated: false,
    },
  });
  await prisma.damPerson.delete({ where: { id: personId } });
  for (const link of person.assets) await syncAssetPersons(link.assetId, [person.name]);
}
