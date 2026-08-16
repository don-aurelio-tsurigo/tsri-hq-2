"use client";

import {
  CAROUSEL_FORMAT_LABELS,
  CAROUSEL_FORMATS,
  type CarouselFormat,
} from "@/lib/carousel/format";

export function CarouselFormatSelector({
  value,
  onChange,
  disabled,
  name = "format",
}: {
  value: CarouselFormat;
  onChange: (format: CarouselFormat) => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-[var(--ink)]">
        1. Format wählen
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Format">
        {CAROUSEL_FORMATS.map((format) => {
          const selected = value === format;
          return (
            <label
              key={format}
              className={[
                "cursor-pointer rounded-lg border-2 px-3 py-2 text-sm font-medium transition",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hover)]"
                  : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--ink)] hover:border-[var(--accent)]/50",
                disabled ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              <input
                type="radio"
                name={name}
                value={format}
                checked={selected}
                onChange={() => onChange(format)}
                className="sr-only"
              />
              {CAROUSEL_FORMAT_LABELS[format]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
