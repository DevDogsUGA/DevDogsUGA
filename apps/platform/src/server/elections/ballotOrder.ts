/**
 * The order a ballot opens in.
 *
 * Requiring a complete ranking means whatever order the form opens in **is
 * already a valid ballot**. Left alone that turns voter apathy into systematic
 * bias: a prefilled alphabetical list quietly rewards teams whose names sort
 * early, every election, forever.
 *
 * Two mitigations, and this module is the first. The second — requiring an
 * interaction before submit — lives in the form, because it is about what the
 * voter did rather than about what they were shown.
 */

/**
 * Seeded rather than random.
 *
 * The shuffle has to be stable for one voter across reloads. A fresh shuffle
 * on every render would move options under somebody halfway through ordering
 * them, which is worse than the bias it was meant to fix — and it would make
 * "I put us second" unverifiable against what they actually submitted.
 *
 * FNV-1a: not cryptographic, and does not need to be. The property required is
 * that two voters get different orders and one voter gets the same order
 * twice; an adversary predicting their own shuffle gains nothing, because the
 * order they see does not affect how their ballot is counted.
 */
export function seedFrom(...parts: string[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, and adequate for shuffling a handful of teams. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, so every permutation is equally likely. */
function shuffle<T>(items: T[], seed: number): T[] {
  const random = generator(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface Orderable {
  teamId: string;
}

/**
 * The presented order for one voter's ballot.
 *
 * The voter's own team is pinned first rather than shuffled in. That is not a
 * convenience — teams may rank themselves, and self-ranking cancels out
 * because every team does it, so the position that matters is where they put
 * everybody ELSE. Pinning their own entry keeps it out of the way and makes
 * the deliberate act of demoting themselves visible rather than accidental.
 *
 * `ownTeamId` is null for an officer ballot, which then shuffles completely.
 * Officer ballots get the same treatment despite there being only one of them,
 * because that one carries the weight of an entire category.
 */
export function presentedOrder<T extends Orderable>(
  options: T[],
  ownTeamId: string | null,
  seed: number,
): T[] {
  const own =
    ownTeamId === null ? [] : options.filter((o) => o.teamId === ownTeamId);
  const rest = options.filter((o) => o.teamId !== ownTeamId);
  return [...own, ...shuffle(rest, seed)];
}

export type BallotProblem =
  | "incomplete"
  | "duplicate"
  | "unknown_team"
  | "untouched";

/**
 * Whether a submitted ranking is a ballot at all.
 *
 * Complete rankings are required — with a handful of candidates it is no
 * burden, and it removes truncation strategy, ballot exhaustion, and any rule
 * about how to score unranked teams. So "they left one out" is a rejection
 * rather than something the tally has to interpret.
 *
 * `touched` is the second mitigation: a ballot cast by pressing submit on an
 * untouched form should be impossible. The form enforces it too, but the form
 * is the half an attacker skips.
 */
export function validateBallot(
  submitted: string[],
  eligible: string[],
  touched: boolean,
): BallotProblem | null {
  if (!touched) return "untouched";

  const unique = new Set(submitted);
  if (unique.size !== submitted.length) return "duplicate";

  const allowed = new Set(eligible);
  for (const teamId of submitted) {
    if (!allowed.has(teamId)) return "unknown_team";
  }

  if (submitted.length !== eligible.length) return "incomplete";

  return null;
}
