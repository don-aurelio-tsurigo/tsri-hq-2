import { z } from "zod";

export const kurzmeldungDraftSchema = z.object({
  title: z.string().min(1),
  lead: z.string().min(1),
  imageCaption: z.string().nullable().optional(),
  body: z.string().min(1),
  sourceUrl: z.string().min(1),
});

export type KurzmeldungDraft = z.infer<typeof kurzmeldungDraftSchema>;

export function formatKurzmeldungForCopy(draft: KurzmeldungDraft): string {
  const parts = [`# ${draft.title}`, "", draft.lead, "", draft.body];
  if (draft.imageCaption?.trim()) {
    parts.push("", `*Bildlegende: ${draft.imageCaption.trim()}*`);
  }
  // sourceUrl is metadata only — already cited inline in body
  return parts.join("\n");
}
