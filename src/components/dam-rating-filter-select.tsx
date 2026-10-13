"use client";

import { useState } from "react";
import {
  RATING_OPS,
  RATING_VALUES,
  isNoopRatingFilter,
  makeRatingFilter,
  ratingFilterParts,
  ratingValueStars,
  type RatingFilter,
  type RatingOp,
  type RatingValue,
} from "@/lib/dam/rating-filter";

/** Comparison (= ≥ ≤) plus star count; "Alle" in the count turns the filter off. */
export function DamRatingFilterSelect({
  id,
  value,
  onChange,
  className = "field",
}: {
  id: string;
  value: RatingFilter;
  onChange: (next: RatingFilter) => void;
  className?: string;
}) {
  const parts = ratingFilterParts(value);
  // Remember the operator while the count is "Alle" so ≥ survives a reset.
  const [pendingOp, setPendingOp] = useState<RatingOp>(parts?.op ?? "eq");
  const op = parts?.op ?? pendingOp;

  return (
    <div className={className}>
      <label htmlFor={id}>Sterne</label>
      <div className="flex gap-1.5">
        <select
          aria-label="Vergleich"
          className="shrink-0"
          value={op}
          onChange={(event) => {
            const nextOp = event.target.value as RatingOp;
            setPendingOp(nextOp);
            if (parts) onChange(makeRatingFilter(nextOp, parts.value));
          }}
        >
          {RATING_OPS.map((option) => (
            <option key={option.value} value={option.value} title={option.title}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          id={id}
          className="min-w-0 flex-1"
          value={parts ? String(parts.value) : ""}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(
              raw === "" ? "all" : makeRatingFilter(op, Number(raw) as RatingValue),
            );
          }}
        >
          <option value="">Alle</option>
          {RATING_VALUES.filter((n) => !isNoopRatingFilter(op, n)).map((n) => (
            <option key={n} value={n} aria-label={`${n} Sterne`}>
              {ratingValueStars(n)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
