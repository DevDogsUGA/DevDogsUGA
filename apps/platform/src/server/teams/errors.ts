/**
 * Typed failures for the team actions.
 *
 * The join screens branch on these — "the competition is over", "close your PR
 * first", "link GitHub to join" and "that team is full" are four different
 * screens, and a string message cannot be switched on without matching prose
 * that translation or a copy edit will break.
 */
export type TeamActionCode =
  /** Judging has begun, or the competition does not exist. */
  | "competition_closed"
  /** The team has a live entry, an officer lock, or judging has started. */
  | "roster_locked"
  /** Joining provisions repository access, which needs a linked GitHub identity. */
  | "github_not_linked"
  /** The team is at its effective cap. */
  | "team_full"
  /** One team per member per competition. */
  | "already_on_team"
  /** The caller is not on the team the action targets. */
  | "not_a_member"
  /** The action is the lead's to take. */
  | "not_the_lead"
  /** A lead cannot leave a team that still has other members. */
  | "lead_must_transfer_first"
  /** The join code did not match. */
  | "bad_join_code"
  /** The request is not pending, or is not the caller's to answer. */
  | "request_not_actionable"
  /** Another team in this competition already uses that name. */
  | "name_taken"
  /** The team, request or competition named does not exist. */
  | "not_found";

/**
 * Everything a caller can be told, including the one thing the domain does not
 * choose. `"unknown"` is a fault rather than a refusal — a dropped connection,
 * a constraint nothing translated — and it is in the same union so the message
 * table below can be a TOTAL record, which is what makes adding a code a build
 * error rather than a blank paragraph in front of whoever hits it first.
 */
export type TeamProblemCode = TeamActionCode | "unknown";

/**
 * What every exported team action returns.
 *
 * A result rather than a throw, because a thrown error does not survive the
 * trip to a client component: Next redacts an uncaught server-action error in
 * production and hands the browser an opaque digest, so `error.code` reads
 * correctly in development and is gone once deployed.
 */
export type TeamActionOutcome<T> =
  { ok: true; value: T } | { ok: false; code: TeamProblemCode };

export class TeamActionError extends Error {
  readonly code: TeamActionCode;

  constructor(code: TeamActionCode, message?: string) {
    super(message ?? code);
    this.name = "TeamActionError";
    this.code = code;
  }
}

interface PostgresErrorShape {
  code?: unknown;
  constraint_name?: unknown;
}

/**
 * Finds the driver error inside whatever Drizzle threw.
 *
 * **Drizzle wraps.** Every failed statement arrives as a `DrizzleQueryError`
 * whose own `code` is `undefined`, with the `PostgresError` — the one carrying
 * `23505` and `constraint_name` — on `.cause`. Reading the fields off the
 * outer error therefore never matches, silently: the catch block falls
 * through, the caller re-throws, and a member who is already on a team gets a
 * 500 instead of "you are already on a team".
 *
 * Nothing about that is visible in a type, and it only shows up against a real
 * database, which is why it survived until the ballot write path was exercised
 * against one.
 *
 * The chain is walked rather than unwrapped once, because a nested transaction
 * can add another layer and a fixed `.cause` would break again.
 */
function driverError(error: unknown): PostgresErrorShape | null {
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return null;
    const candidate = current as PostgresErrorShape & { cause?: unknown };
    if (typeof candidate.code === "string") return candidate;
    current = candidate.cause;
  }

  return null;
}

/** The SQLSTATE of a failed statement, or null if this is not a driver error. */
export function sqlState(error: unknown): string | null {
  const driver = driverError(error);
  return typeof driver?.code === "string" ? driver.code : null;
}

/**
 * Whether a driver error is a unique violation of a specific constraint.
 *
 * Matching on the constraint name rather than on `23505` alone is the point:
 * one insert can violate more than one unique index, and the caller has to
 * know which — "you are already on a team" and "that slug is taken" are
 * different sentences.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const driver = driverError(error);
  return driver?.code === "23505" && driver.constraint_name === constraint;
}
