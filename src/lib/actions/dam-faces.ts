"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addManualPerson,
  assignFace,
  canEditAssetFaces,
  deletePerson,
  FaceActionError,
  ignoreFace,
  loadAssetFacesState,
  rejectFace,
  removeAssetPerson,
  renamePerson,
  unignoreFace,
  type AssetFacesState,
  type PersonInput,
} from "@/lib/dam/face-assign";
import { editableFaceIds } from "@/lib/dam/face-overview";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";

export type FaceActionResult = {
  error?: string;
  state?: AssetFacesState;
  /** Other photos where the person was found (confirmed / suggested). */
  propagated?: { confirmed: number; suggested: number };
};

const idSchema = z.string().min(1).max(64);
const personInputSchema = z.union([
  z.object({ personId: idSchema }),
  z.object({ name: z.string().trim().min(1).max(120) }),
]);

function revalidateDam() {
  revalidatePath("/dam/personal");
  revalidatePath("/dam/archive");
  revalidatePath("/dam/personen", "layout");
}

async function assetIdForFace(faceId: string): Promise<string | null> {
  const face = await prisma.assetFace.findUnique({
    where: { id: faceId },
    select: { assetId: true },
  });
  return face?.assetId ?? null;
}

async function run(
  assetId: string | null,
  userId: string,
  action: () => Promise<{ propagated?: FaceActionResult["propagated"] } | void>,
): Promise<FaceActionResult> {
  if (!assetId || !(await canEditAssetFaces(userId, assetId))) {
    return { error: "Bild nicht gefunden." };
  }
  try {
    const result = await action();
    const state = await loadAssetFacesState(assetId);
    revalidateDam();
    return { state: state ?? undefined, propagated: result?.propagated };
  } catch (error) {
    if (error instanceof FaceActionError) return { error: error.message };
    console.error("[dam-face] action failed", error);
    return { error: "Gesichtserkennung: Aktion fehlgeschlagen." };
  }
}

export async function assignAssetFace(faceId: unknown, input: unknown): Promise<FaceActionResult> {
  const { session } = await requireMembership();
  const id = idSchema.safeParse(faceId);
  const person = personInputSchema.safeParse(input);
  if (!id.success || !person.success) return { error: "Ungültige Eingabe." };
  return run(await assetIdForFace(id.data), session.user.id, async () => {
    const result = await assignFace(session.user.id, id.data, person.data as PersonInput);
    return { propagated: result.propagated };
  });
}

export async function rejectAssetFace(faceId: unknown): Promise<FaceActionResult> {
  const { session } = await requireMembership();
  const id = idSchema.safeParse(faceId);
  if (!id.success) return { error: "Ungültige Eingabe." };
  return run(await assetIdForFace(id.data), session.user.id, async () => {
    await rejectFace(id.data);
  });
}

export async function ignoreAssetFace(faceId: unknown): Promise<FaceActionResult> {
  const { session } = await requireMembership();
  const id = idSchema.safeParse(faceId);
  if (!id.success) return { error: "Ungültige Eingabe." };
  return run(await assetIdForFace(id.data), session.user.id, async () => {
    await ignoreFace(id.data);
  });
}

export async function unignoreAssetFace(faceId: unknown): Promise<FaceActionResult> {
  const { session } = await requireMembership();
  const id = idSchema.safeParse(faceId);
  if (!id.success) return { error: "Ungültige Eingabe." };
  return run(await assetIdForFace(id.data), session.user.id, async () => {
    await unignoreFace(id.data);
  });
}

export async function addAssetPerson(assetId: unknown, input: unknown): Promise<FaceActionResult> {
  const { session } = await requireMembership();
  const id = idSchema.safeParse(assetId);
  const person = personInputSchema.safeParse(input);
  if (!id.success || !person.success) return { error: "Ungültige Eingabe." };
  return run(id.data, session.user.id, async () => {
    await addManualPerson(session.user.id, id.data, person.data as PersonInput);
  });
}

export async function removeAssetPersonAction(
  assetId: unknown,
  personId: unknown,
): Promise<FaceActionResult> {
  const { session } = await requireMembership();
  const id = idSchema.safeParse(assetId);
  const person = idSchema.safeParse(personId);
  if (!id.success || !person.success) return { error: "Ungültige Eingabe." };
  return run(id.data, session.user.id, async () => {
    await removeAssetPerson(id.data, person.data);
  });
}

// ─── Übersicht /dam/personen ─────────────────────────────────────

export type BulkFaceResult = { error?: string; count?: number };

const faceIdsSchema = z.array(idSchema).min(1).max(200);

async function runBulk(
  faceIds: unknown,
  each: (userId: string, faceId: string) => Promise<unknown>,
): Promise<BulkFaceResult> {
  const { session } = await requireMembership();
  const parsed = faceIdsSchema.safeParse(faceIds);
  if (!parsed.success) return { error: "Keine Gesichter gewählt." };
  const ids = await editableFaceIds(session.user.id, parsed.data);
  if (ids.length === 0) return { error: "Gesichter nicht gefunden." };
  try {
    for (const id of ids) await each(session.user.id, id);
  } catch (error) {
    if (error instanceof FaceActionError) return { error: error.message };
    console.error("[dam-face] bulk action failed", error);
    return { error: "Gesichtserkennung: Aktion fehlgeschlagen." };
  } finally {
    revalidateDam();
  }
  return { count: ids.length };
}

export async function ignoreFaces(faceIds: unknown): Promise<BulkFaceResult> {
  return runBulk(faceIds, (_userId, id) => ignoreFace(id));
}

export async function unignoreFaces(faceIds: unknown): Promise<BulkFaceResult> {
  return runBulk(faceIds, (_userId, id) => unignoreFace(id));
}

export async function rejectFaces(faceIds: unknown): Promise<BulkFaceResult> {
  return runBulk(faceIds, (_userId, id) => rejectFace(id));
}

/** Assign several faces to one person; only the first one searches the archive. */
export async function assignFaces(faceIds: unknown, input: unknown): Promise<BulkFaceResult> {
  const person = personInputSchema.safeParse(input);
  if (!person.success) return { error: "Ungültige Eingabe." };
  let target: PersonInput = person.data as PersonInput;
  let first = true;
  return runBulk(faceIds, async (userId, id) => {
    const result = await assignFace(userId, id, target, { propagate: first });
    // A newly created person is reused for the remaining faces.
    target = { personId: result.person.id };
    first = false;
  });
}

export async function renameDamPerson(personId: unknown, name: unknown): Promise<BulkFaceResult> {
  await requireMembership();
  const id = idSchema.safeParse(personId);
  const parsedName = z.string().trim().min(1).max(120).safeParse(name);
  if (!id.success || !parsedName.success) return { error: "Ungültiger Name." };
  try {
    await renamePerson(id.data, parsedName.data);
  } catch (error) {
    if (error instanceof FaceActionError) return { error: error.message };
    console.error("[dam-face] rename failed", error);
    return { error: "Umbenennen fehlgeschlagen." };
  }
  revalidateDam();
  return {};
}

export async function deleteDamPerson(personId: unknown): Promise<BulkFaceResult> {
  await requireMembership();
  const id = idSchema.safeParse(personId);
  if (!id.success) return { error: "Ungültige Person." };
  try {
    await deletePerson(id.data);
  } catch (error) {
    console.error("[dam-face] delete person failed", error);
    return { error: "Person konnte nicht gelöscht werden." };
  }
  revalidateDam();
  return {};
}
