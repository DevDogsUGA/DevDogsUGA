/**
 * The pure half of `import badges`: given the evidence rows and the awards
 * that already exist, decide what to award and what to skip, with a reason.
 * The database half (`store.ts`) then calls the same SQL the triggers use, so
 * this plan only chooses which members to hand to it; it never re-states the
 * award rules themselves.
 */

/** One submitted reflection on a meeting, as the store reads it. */
export interface ReflectionEvidence {
  reflectionId: string;
  userId: string;
  meetingId: string;
  /** The workshop the member chose, null on reflections from before the picker. */
  workshopDefinitionId: string | null;
  /** The live workshops the meeting ran (distinct definition ids). */
  offered: readonly string[];
  /** An attendance row exists for this member and meeting. */
  attended: boolean;
  /** The meeting is neither archived nor cancelled. */
  meetingLive: boolean;
}

export type WorkshopSkipReason =
  | "no attendance"
  | "meeting archived or cancelled"
  | "workshop did not run at the meeting"
  | "meeting ran no workshop"
  | "meeting ran several workshops and none was chosen";

export interface WorkshopAward {
  userId: string;
  definitionId: string;
  /**
   * Reflections that need their workshop recorded first, because the member
   * never chose one and the meeting ran exactly one (what the picker defaults
   * to). Empty when the member chose.
   */
  assign: string[];
}

export interface WorkshopPlan {
  awards: WorkshopAward[];
  /** Pairs that already have a row: live, manual or withdrawn. */
  alreadyAwarded: number;
  skipped: Record<WorkshopSkipReason, number>;
}

const emptySkips = (): Record<WorkshopSkipReason, number> => ({
  "no attendance": 0,
  "meeting archived or cancelled": 0,
  "workshop did not run at the meeting": 0,
  "meeting ran no workshop": 0,
  "meeting ran several workshops and none was chosen": 0,
});

export const pairKey = (userId: string, definitionId: string) =>
  `${userId}|${definitionId}`;

/**
 * `liveAwards` holds `pairKey`s of every Workshop completed row, manual and
 * withdrawn ones included: an officer's award or withdrawal is never touched
 * (the sync would insert a fresh award past a withdrawn row), and a pair that
 * has any row is not handed to the sync.
 */
export function planWorkshops(
  evidence: readonly ReflectionEvidence[],
  liveAwards: ReadonlySet<string>,
): WorkshopPlan {
  const skipped = emptySkips();
  const byPair = new Map<string, WorkshopAward>();
  const held = new Set<string>();
  const sorted = [...evidence].sort((a, b) =>
    a.reflectionId.localeCompare(b.reflectionId),
  );

  for (const r of sorted) {
    if (!r.attended) {
      skipped["no attendance"]++;
      continue;
    }
    if (!r.meetingLive) {
      skipped["meeting archived or cancelled"]++;
      continue;
    }
    let definitionId = r.workshopDefinitionId;
    let defaulted = false;
    if (definitionId) {
      if (!r.offered.includes(definitionId)) {
        skipped["workshop did not run at the meeting"]++;
        continue;
      }
    } else if (r.offered.length === 1) {
      // D2's picker defaults the same way (saveReflection).
      definitionId = r.offered[0]!;
      defaulted = true;
    } else if (r.offered.length === 0) {
      skipped["meeting ran no workshop"]++;
      continue;
    } else {
      skipped["meeting ran several workshops and none was chosen"]++;
      continue;
    }

    const key = pairKey(r.userId, definitionId);
    if (liveAwards.has(key)) {
      held.add(key);
      continue;
    }
    const award = byPair.get(key) ?? {
      userId: r.userId,
      definitionId,
      assign: [],
    };
    if (defaulted) award.assign.push(r.reflectionId);
    byPair.set(key, award);
  }

  return {
    awards: [...byPair.values()],
    alreadyAwarded: held.size,
    skipped,
  };
}

export interface FirstCommitPlan {
  /** Members with a stored default-branch commit and no First Commit row at all. */
  userIds: string[];
  /** Members who already have a row (live, withdrawn or officer-made). */
  alreadyHeld: number;
}

/**
 * First Commit goes to a member with a stored default-branch commit who has
 * never had the badge: `award_first_commit` itself refuses once any row exists,
 * withdrawn or not, so a withdrawal by an officer stands.
 */
export function planFirstCommit(
  committers: readonly string[],
  holders: ReadonlySet<string>,
): FirstCommitPlan {
  const unique = [...new Set(committers)].sort();
  const userIds = unique.filter((u) => !holders.has(u));
  return { userIds, alreadyHeld: unique.length - userIds.length };
}

export interface BadgesPlan {
  workshop: WorkshopPlan;
  firstCommit: FirstCommitPlan;
}

export function describePlan(plan: BadgesPlan): string {
  const { workshop: w, firstCommit: f } = plan;
  const skips = Object.entries(w.skipped)
    .filter(([, n]) => n > 0)
    .map(([why, n]) => `    ${n} skipped: ${why}`);
  const defaulted = w.awards.filter((a) => a.assign.length > 0).length;
  return [
    "Workshop completed:",
    `  ${w.awards.length} to award (${defaulted} from a meeting that ran exactly one workshop, workshop recorded on the reflection)`,
    `  ${w.alreadyAwarded} already awarded`,
    ...(skips.length ? ["  skipped, never guessed:", ...skips] : []),
    "First Commit:",
    `  ${f.userIds.length} to award`,
    `  ${f.alreadyHeld} already held (officer awards and withdrawals stand)`,
  ].join("\n");
}
