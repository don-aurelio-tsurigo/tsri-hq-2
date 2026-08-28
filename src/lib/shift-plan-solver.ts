import { isoWeekdayFromDateKey, type Weekday } from "@/lib/newsletter-constants";

export type SolverType = {
  id: string;
  name: string;
  isEveningShift: boolean;
  schedulingMode: "newsletter" | "manualDates";
  /** Precomputed open slot dates for this type in the month */
  slotDateKeys: string[];
};

export type SolverMember = {
  userId: string;
  name: string;
  fixedDayOff: number | null;
};

export type SolverQuota = {
  userId: string;
  typeId: string;
  minCount: number;
  maxCount: number;
  isFixed: boolean;
};

export type SolverVacation = {
  userId: string;
  /** Inclusive yyyy-MM-dd range */
  startKey: string;
  endKey: string;
};

export type SolverExisting = {
  userId: string | null;
  typeId: string;
  dateKey: string;
  status: "planned" | "published" | "skipped" | "proposed";
};

export type SolverAssignment = {
  userId: string;
  typeId: string;
  dateKey: string;
};

export type SolverInput = {
  year: number;
  month: number; // 1–12
  types: SolverType[];
  members: SolverMember[];
  quotas: SolverQuota[];
  vacations: SolverVacation[];
  /** Existing non-proposed campaigns (and council stubs including skipped) */
  existing: SolverExisting[];
  /** Type id for Züri Briefing (compensation target) */
  briefingTypeId: string | null;
  /** Type id for Gemeinderats-Briefing */
  councilTypeId: string | null;
};

export type SolverResult = {
  assignments: SolverAssignment[];
  warnings: string[];
};

function dateKeysInMonth(year: number, month: number): string[] {
  const keys: string[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const m = String(month).padStart(2, "0");
  for (let d = 1; d <= last; d++) {
    keys.push(`${year}-${m}-${String(d).padStart(2, "0")}`);
  }
  return keys;
}

function isOnVacation(
  userId: string,
  dateKey: string,
  vacations: SolverVacation[],
): boolean {
  return vacations.some(
    (v) =>
      v.userId === userId && dateKey >= v.startKey && dateKey <= v.endKey,
  );
}

function isFixedDayOff(
  member: SolverMember,
  dateKey: string,
): boolean {
  if (member.fixedDayOff == null) return false;
  const wd = isoWeekdayFromDateKey(dateKey);
  return wd === member.fixedDayOff;
}

type State = {
  /** userId -> set of dateKeys already assigned */
  userDays: Map<string, Set<string>>;
  /** typeId:dateKey -> userId */
  slotOwner: Map<string, string>;
  assignments: SolverAssignment[];
  counts: Map<string, number>; // `${userId}:${typeId}` -> count
};

function countKey(userId: string, typeId: string) {
  return `${userId}:${typeId}`;
}

function slotKey(typeId: string, dateKey: string) {
  return `${typeId}:${dateKey}`;
}

function getCount(state: State, userId: string, typeId: string) {
  return state.counts.get(countKey(userId, typeId)) ?? 0;
}

function eveningCount(
  state: State,
  userId: string,
  types: SolverType[],
): number {
  let n = 0;
  for (const t of types) {
    if (t.isEveningShift) n += getCount(state, userId, t.id);
  }
  return n;
}

function quotasForUser(userId: string, quotas: SolverQuota[]) {
  return quotas.filter((q) => q.userId === userId);
}

function quotaForType(
  userId: string,
  typeId: string,
  quotas: SolverQuota[],
) {
  return quotas.find((q) => q.userId === userId && q.typeId === typeId);
}

/** Vollständiges Profil: Quote für jeden Schichttyp → nur Typen mit max > 0. */
export function isRestrictedProfile(
  userId: string,
  quotas: SolverQuota[],
  typeCount: number,
): boolean {
  const userQuotas = quotasForUser(userId, quotas);
  return userQuotas.length > 0 && userQuotas.length >= typeCount;
}

export function isTypeEligible(
  userId: string,
  typeId: string,
  quotas: SolverQuota[],
  typeCount: number,
): boolean {
  const q = quotaForType(userId, typeId, quotas);
  if (q && q.maxCount === 0) return false;
  if (isRestrictedProfile(userId, quotas, typeCount)) {
    return q != null && q.maxCount > 0;
  }
  return true;
}

function canAssignMoreOfType(
  state: State,
  userId: string,
  typeId: string,
  quotas: SolverQuota[],
): boolean {
  const q = quotaForType(userId, typeId, quotas);
  if (!q) return true;
  return getCount(state, userId, typeId) < q.maxCount;
}

function canAssign(
  state: State,
  member: SolverMember,
  type: SolverType,
  dateKey: string,
  vacations: SolverVacation[],
  quotas: SolverQuota[],
  typeCount: number,
): boolean {
  if (!type.slotDateKeys.includes(dateKey)) return false;
  if (state.slotOwner.has(slotKey(type.id, dateKey))) return false;
  if (state.userDays.get(member.userId)?.has(dateKey)) return false;
  if (isOnVacation(member.userId, dateKey, vacations)) return false;
  if (isFixedDayOff(member, dateKey)) return false;
  if (!isTypeEligible(member.userId, type.id, quotas, typeCount)) return false;
  if (!canAssignMoreOfType(state, member.userId, type.id, quotas)) {
    return false;
  }
  return true;
}

function assign(
  state: State,
  userId: string,
  typeId: string,
  dateKey: string,
) {
  const days = state.userDays.get(userId) ?? new Set<string>();
  days.add(dateKey);
  state.userDays.set(userId, days);
  state.slotOwner.set(slotKey(typeId, dateKey), userId);
  state.assignments.push({ userId, typeId, dateKey });
  const ck = countKey(userId, typeId);
  state.counts.set(ck, (state.counts.get(ck) ?? 0) + 1);
}

function availableDates(
  state: State,
  member: SolverMember,
  type: SolverType,
  vacations: SolverVacation[],
  quotas: SolverQuota[],
  typeCount: number,
): string[] {
  return type.slotDateKeys.filter((d) =>
    canAssign(state, member, type, d, vacations, quotas, typeCount),
  );
}

function memberById(members: SolverMember[], userId: string) {
  return members.find((m) => m.userId === userId);
}

function typeById(types: SolverType[], typeId: string) {
  return types.find((t) => t.id === typeId);
}

/**
 * Pure shift-plan proposal generator (no DB).
 * Hard rules: max 1 assignment per person/day, vacations + fixedDayOff,
 * fixed quotas, quota caps, restricted profiles, ≥1 evening shift,
 * council only on non-skipped stubs.
 */
export function generateProposal(input: SolverInput): SolverResult {
  const warnings: string[] = [];
  const state: State = {
    userDays: new Map(),
    slotOwner: new Map(),
    assignments: [],
    counts: new Map(),
  };

  const monthKeys = dateKeysInMonth(input.year, input.month);
  const typesById = new Map(input.types.map((t) => [t.id, t]));
  const typeCount = input.types.length;
  const quotas = input.quotas;

  // Seed fixed existing assignments (not proposed, not skipped)
  for (const ex of input.existing) {
    if (ex.status === "proposed" || ex.status === "skipped") continue;
    if (!ex.userId) continue;
    if (!monthKeys.includes(ex.dateKey)) continue;
    if (state.slotOwner.has(slotKey(ex.typeId, ex.dateKey))) continue;
    assign(state, ex.userId, ex.typeId, ex.dateKey);
  }

  // Council compensation: unmet fixed council quotas due to skipped stubs
  // become extra hard Züri-Briefing targets for those users.
  const extraBriefing = new Map<string, number>();
  if (input.councilTypeId && input.briefingTypeId) {
    const councilType = typesById.get(input.councilTypeId);
    const openCouncilSlots = councilType?.slotDateKeys.length ?? 0;
    const councilQuotas = input.quotas.filter(
      (q) => q.typeId === input.councilTypeId && q.isFixed,
    );
    const totalFixedDemand = councilQuotas.reduce(
      (s, q) => s + q.minCount,
      0,
    );
    if (totalFixedDemand > openCouncilSlots && councilQuotas.length > 0) {
      let shortage = totalFixedDemand - openCouncilSlots;
      // Distribute shortage proportionally to fixed council authors
      for (const q of councilQuotas) {
        if (shortage <= 0) break;
        const take = Math.min(q.minCount, shortage);
        if (take > 0) {
          extraBriefing.set(
            q.userId,
            (extraBriefing.get(q.userId) ?? 0) + take,
          );
          const m = memberById(input.members, q.userId);
          warnings.push(
            `${m?.name ?? q.userId}: ${take}× Gemeinderat entfällt (Sitzung skipped) → ${take}× zusätzliches Züri-Briefing.`,
          );
          shortage -= take;
        }
      }
    }
  }

  // --- Phase 1: fixed quotas (council first, then others) ---
  const fixedQuotas = [
    ...input.quotas.filter(
      (q) => q.isFixed && q.typeId === input.councilTypeId,
    ),
    ...input.quotas.filter(
      (q) => q.isFixed && q.typeId !== input.councilTypeId,
    ),
  ];

  for (const q of fixedQuotas) {
    const member = memberById(input.members, q.userId);
    const type = typeById(input.types, q.typeId);
    if (!member || !type) continue;

    const target = q.minCount;
    let have = getCount(state, q.userId, q.typeId);

    // For council authors with compensation, reduce council target by extra
    let effectiveTarget = target;
    if (
      input.councilTypeId &&
      q.typeId === input.councilTypeId &&
      extraBriefing.has(q.userId)
    ) {
      effectiveTarget = Math.max(
        0,
        target - (extraBriefing.get(q.userId) ?? 0),
      );
    }

    while (have < effectiveTarget) {
      const dates = availableDates(
        state,
        member,
        type,
        input.vacations,
        quotas,
        typeCount,
      );
      if (dates.length === 0) {
        warnings.push(
          `Fixquote ${type.name} für ${member.name}: ${have}/${effectiveTarget} möglich (Ferien/freier Tag/Konflikte).`,
        );
        break;
      }
      // Prefer dates that don't already overload evening if this isn't evening
      const pick = dates[0]!;
      assign(state, member.userId, type.id, pick);
      have += 1;
    }
  }

  // Apply compensation as hard briefing quotas
  if (input.briefingTypeId) {
    const briefingType = typesById.get(input.briefingTypeId);
    if (briefingType) {
      for (const [userId, extra] of extraBriefing) {
        const member = memberById(input.members, userId);
        if (!member) continue;
        let have = getCount(state, userId, briefingType.id);
        const target = have + extra;
        while (have < target) {
          const dates = availableDates(
            state,
            member,
            briefingType,
            input.vacations,
            quotas,
            typeCount,
          );
          if (dates.length === 0) {
            warnings.push(
              `Kompensations-Briefing für ${member.name}: nur ${have - (target - extra)}/${extra} zusätzlich möglich.`,
            );
            break;
          }
          assign(state, member.userId, briefingType.id, dates[0]!);
          have += 1;
        }
      }
    }
  }

  // --- Phase 2: ensure ≥1 evening shift per member (not for restricted profiles) ---
  const eveningTypes = input.types.filter((t) => t.isEveningShift);
  for (const member of input.members) {
    if (isRestrictedProfile(member.userId, quotas, typeCount)) continue;
    if (eveningCount(state, member.userId, input.types) >= 1) continue;
    let placed = false;
    for (const type of eveningTypes) {
      if (!isTypeEligible(member.userId, type.id, quotas, typeCount)) {
        continue;
      }
      const dates = availableDates(
        state,
        member,
        type,
        input.vacations,
        quotas,
        typeCount,
      );
      if (dates.length === 0) continue;
      assign(state, member.userId, type.id, dates[0]!);
      placed = true;
      break;
    }
    if (!placed) {
      warnings.push(
        `${member.name}: kein Abendeinsatz möglich in diesem Monat.`,
      );
    }
  }

  // --- Phase 3: soft preferences (min..max) ---
  const softQuotas = input.quotas.filter((q) => !q.isFixed && q.maxCount > 0);
  for (const q of softQuotas) {
    const member = memberById(input.members, q.userId);
    const type = typeById(input.types, q.typeId);
    if (!member || !type) continue;
    if (!isTypeEligible(q.userId, q.typeId, quotas, typeCount)) continue;
    let have = getCount(state, q.userId, q.typeId);
    while (have < q.minCount) {
      const dates = availableDates(
        state,
        member,
        type,
        input.vacations,
        quotas,
        typeCount,
      );
      if (dates.length === 0) {
        warnings.push(
          `Präferenz ${type.name} für ${member.name}: ${have}/${q.minCount} (Minimum).`,
        );
        break;
      }
      assign(state, member.userId, type.id, dates[0]!);
      have += 1;
    }
  }

  // Fill toward soft max where slots remain (prefer underfilled)
  for (const q of softQuotas) {
    const member = memberById(input.members, q.userId);
    const type = typeById(input.types, q.typeId);
    if (!member || !type) continue;
    if (!isTypeEligible(q.userId, q.typeId, quotas, typeCount)) continue;
    let have = getCount(state, q.userId, q.typeId);
    while (have < q.maxCount) {
      const dates = availableDates(
        state,
        member,
        type,
        input.vacations,
        quotas,
        typeCount,
      );
      if (dates.length === 0) break;
      assign(state, member.userId, type.id, dates[0]!);
      have += 1;
    }
  }

  // --- Phase 4: fill remaining non-manual slots (esp. Repo) evenly ---
  const fillTypes = input.types.filter(
    (t) => t.schedulingMode !== "manualDates",
  );
  for (const type of fillTypes) {
    for (const dateKey of type.slotDateKeys) {
      if (state.slotOwner.has(slotKey(type.id, dateKey))) continue;

      const candidates = input.members
        .filter((m) =>
          canAssign(state, m, type, dateKey, input.vacations, quotas, typeCount),
        )
        .map((m) => {
          const soft = softQuotas.find(
            (q) => q.userId === m.userId && q.typeId === type.id,
          );
          const hard = quotaForType(m.userId, type.id, quotas);
          const count = getCount(state, m.userId, type.id);
          const cap = hard?.maxCount ?? soft?.maxCount;
          const overCap = cap != null && count >= cap ? 1 : 0;
          const totalShifts =
            state.userDays.get(m.userId)?.size ?? 0;
          return { member: m, count, overCap, totalShifts };
        })
        .sort(
          (a, b) =>
            a.overCap - b.overCap ||
            a.count - b.count ||
            a.totalShifts - b.totalShifts ||
            a.member.name.localeCompare(b.member.name, "de"),
        );

      if (candidates.length === 0) {
        warnings.push(
          `Kein:e Autor:in für ${type.name} am ${dateKey}.`,
        );
        continue;
      }
      const pick = candidates[0]!;
      assign(state, pick.member.userId, type.id, dateKey);
    }
  }

  // Only return newly proposed assignments (exclude seeded existing)
  const seeded = new Set(
    input.existing
      .filter(
        (e) =>
          e.userId &&
          e.status !== "proposed" &&
          e.status !== "skipped",
      )
      .map((e) => `${e.userId}:${e.typeId}:${e.dateKey}`),
  );
  const assignments = state.assignments.filter(
    (a) => !seeded.has(`${a.userId}:${a.typeId}:${a.dateKey}`),
  );

  return { assignments, warnings };
}

/** Test helper: ISO weekday of a date key */
export function _testIsoWeekday(dateKey: string): Weekday | null {
  return isoWeekdayFromDateKey(dateKey);
}
