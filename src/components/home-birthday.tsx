import { formatBirthdayAnnouncement } from "@/lib/birthdays";

export function HomeBirthday({
  isOwnBirthday,
  otherNames,
}: {
  isOwnBirthday: boolean;
  otherNames: string[];
}) {
  if (!isOwnBirthday && otherNames.length === 0) return null;

  const othersLine = formatBirthdayAnnouncement(otherNames);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--highlight)]/50 px-4 py-4">
      {isOwnBirthday ? (
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
          🎉 Happy Birthday
        </h2>
      ) : null}
      {othersLine ? (
        <p
          className={
            isOwnBirthday
              ? "mt-1 text-sm font-medium"
              : "font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight"
          }
        >
          {othersLine}
        </p>
      ) : null}
    </section>
  );
}
