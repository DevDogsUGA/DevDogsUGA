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
  /** The team, request or competition named does not exist. */
  | "not_found";

export class TeamActionError extends Error {
  readonly code: TeamActionCode;

  constructor(code: TeamActionCode, message?: string) {
    super(message ?? code);
    this.name = "TeamActionError";
    this.code = code;
  }
}

/**
 * Whether a driver error is a unique violation of a specific constraint.
 *
 * Matching on the constraint name rather than on `23505` alone is the point:
 * one insert can violate more than one unique index, and the caller has to
 * know which — "you are already on a team" and "that slug is taken" are
 * different sentences. postgres-js surfaces both fields on the error.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; constraint_name?: unknown };
  return e.code === "23505" && e.constraint_name === constraint;
}
