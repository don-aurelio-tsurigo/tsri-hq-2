"use client";

import { Star } from "lucide-react";

export function DamRatingStars({
  rating,
  onRate,
  size = "sm",
}: {
  rating: number | null;
  onRate?: (n: number) => void;
  size?: "sm" | "md";
}) {
  const icon = size === "md" ? "size-6" : "size-3";
  if (!onRate) {
    return (
      <div
        className="flex gap-0.5 text-[var(--muted)]"
        aria-label={rating ? `Rating ${rating}` : "Kein Rating"}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={icon}
            fill={rating && rating >= n ? "currentColor" : "none"}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onRate(n)}
          className="text-[var(--muted)] hover:text-[var(--fg)]"
          aria-label={`Rating ${n}`}
        >
          <Star
            className={icon}
            fill={rating && rating >= n ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}
