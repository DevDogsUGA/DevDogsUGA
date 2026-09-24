/**
 * Typed failures for the team actions.
 *
 * The join screens branch on these. "Link GitHub to join", "that team is
 * full", and "you are already on two teams" are three different screens, and
 * a string message cannot be switched on without matching prose that
 * translation or a copy edit will break.
 */
export type TeamActionCode =
  /** Joining provisions repository access, which needs a linked GitHub identity. */
  | "github_not_linked"
  /** GitHub did not apply the change; the mirror was left untouched. */
  | "github_unavailable"
  /** The linked GitHub account has 2FA off. Membership grants push access to
   *  the org repo, so this is refused rather than granted with a weaker
   *  account sitting on the roster. */
  | "github_2fa_required"
  /** GitHub could not be asked whether 2FA is on, so this fails closed rather
   *  than guessing. See `server/github/twoFactor.ts`. */
  | "github_2fa_unverifiable"
  /** The team is at `MAX_TEAM_SIZE` active members. */
  | "team_full"
  /** The caller is already at `MAX_CONCURRENT_TEAMS_PER_USER` active teams. */
  | "too_many_teams"
  /** The caller is already an active member of this team. */
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
  /** Another team already uses that name. */
  | "name_taken"
  /** No account matches the exact email or GitHub username an invite named. */
  | "invitee_not_found"
  /** The team or request named does not exist. */
  | "not_found"
  /**
   * The caller (or, for invites, the team) hit its budget for this action
   * within the tracked window. See `server/rateLimit.ts` and the budgets
   * chosen per call site in `server/actions/teams.ts`.
   */
  | "rate_limited";

/**
 * Everything a caller can be told, including the one thing the domain does not
 * choose. `"unknown"` is a fault rather than a refusal: a dropped connection, a
 * constraint nothing translated. It is in the same union so the message table
 * below can be a TOTAL record, which makes adding a code a build error rather
 * than a blank paragraph in front of whoever hits it first.
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
 * whose own `code` is `undefined`, with the `PostgresError` carrying `23505`
 * and `constraint_name` on `.cause`. Reading the fields off the outer error
 * never matches, and fails silently: the catch block falls through, the caller
 * re-throws, and a member who is already on a team gets a 500 instead of "you
 * are already on a team". None of it is visible in a type, and it only shows up
 * against a real database, which is why it survived until code exercising it
 * ran against one.
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
 * one insert can violate more than one unique index, and the caller has to know
 * which. "You are already on a team" and "that slug is taken" are different
 * sentences.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const driver = driverError(error);
  return driver?.code === "23505" && driver.constraint_name === constraint;
}
