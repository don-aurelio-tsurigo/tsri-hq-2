import { createCarouselPost } from "@/lib/actions";
import {
  CAROUSEL_FORMAT_LABELS,
  CAROUSEL_FORMATS,
} from "@/lib/carousel/format";

/** Fallback-Route: Form-Action statt Mutation während RSC-Render. */
export default function NewCarouselPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-16">
      <form action={createCarouselPost} className="space-y-4">
        <fieldset className="field">
          <legend className="text-sm font-bold text-[var(--muted)]">
            Format
          </legend>
          <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-2">
            {CAROUSEL_FORMATS.map((format) => (
              <label
                key={format}
                className="flex items-center gap-2 text-sm font-medium"
              >
                <input
                  type="radio"
                  name="format"
                  value={format}
                  defaultChecked={format === "standard"}
                />
                {CAROUSEL_FORMAT_LABELS[format]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="text-center">
          <button type="submit" className="btn btn-primary">
            Weiter
          </button>
        </div>
      </form>
    </div>
  );
}
