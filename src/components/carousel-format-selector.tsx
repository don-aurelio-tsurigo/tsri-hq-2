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
    <fieldset className="field" disabled={disabled}>
      <legend className="text-sm font-bold text-[var(--muted)]">Format</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
        {CAROUSEL_FORMATS.map((format) => (
          <label
            key={format}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <input
              type="radio"
              name={name}
              value={format}
              checked={value === format}
              onChange={() => onChange(format)}
            />
            {CAROUSEL_FORMAT_LABELS[format]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
