"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addManualPerson,
  assignFace,
  canEditAssetFaces,
  FaceActionError,
  ignoreFace,
  loadAssetFacesState,
  rejectFace,
  removeAssetPerson,
  unignoreFace,
  type AssetFacesState,
  type PersonInput,
} from "@/lib/dam/face-assign";
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
