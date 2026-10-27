/**
 * The `pick` query values a ZIP request carries: `<subject>@<format>`, one per
 * graphic wanted. Plain strings so the picker is an HTML form with no script.
 */

/**
 * One ZIP's ceiling, set by the Worker's CPU rather than by taste. Each PNG is
 * drawn on request at roughly 0.4 to 1s of CPU (measured on workerd: 18 images
 * in about 12s), and a Worker's default budget is 30s per request. 30 images
 * is a night and three workshops at every size, with headroom; more is a
 * second ZIP.
 */
export const MAX_PICKS = 30;

export interface Pick {
  subject: string;
  format: string;
}

export type PicksResult =
  { ok: true; picks: Pick[] } | { ok: false; reason: string };

export function pickValue(pick: Pick): string {
  return `${pick.subject}@${pick.format}`;
}

/**
 * Validates a request's picks against what the meeting offers.
 *
 * Unknown subjects or formats are an error rather than skipped: a ZIP that
 * quietly omits half of what was ticked is worse than one that says why not.
 * Duplicates collapse, because the same entry twice would be a ZIP with two
 * files of one name.
 */
export function parsePicks(
  values: readonly string[],
  allowed: { subjects: readonly string[]; formats: readonly string[] },
): PicksResult {
  const picks = new Map<string, Pick>();

  for (const value of values) {
    const at = value.lastIndexOf("@");
    const subject = at === -1 ? "" : value.slice(0, at);
    const format = at === -1 ? "" : value.slice(at + 1);

    if (!allowed.subjects.includes(subject)) {
      return { ok: false, reason: `Unknown graphic "${value}".` };
    }
    if (!allowed.formats.includes(format)) {
      return { ok: false, reason: `Unknown size "${format}".` };
    }
    picks.set(value, { subject, format });
  }

  if (picks.size === 0) return { ok: false, reason: "Pick at least one." };
  if (picks.size > MAX_PICKS) {
    return {
      ok: false,
      reason: `At most ${MAX_PICKS} graphics fit in one ZIP.`,
    };
  }

  return { ok: true, picks: [...picks.values()] };
}
