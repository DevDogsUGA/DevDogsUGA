/**
 * What the database refuses, read as data. The store pre-checks every rule it
 * can, so these are the races and the second line of defence: two members
 * citing one commit, a name taken a moment ago, a guard trigger firing on a
 * state the pre-check read a moment too early. The store turns each into the
 * sentence the member needs.
 */

export interface PgFailure {
  code: string | null;
  constraint: string | null;
  message: string;
  /** The driver's `detail` line, e.g. `Key (sha)=(…) already exists.` */
  detail: string;
}

/** Walk the `cause` chain: Drizzle wraps the driver's error. */
export function pgFailure(error: unknown): PgFailure | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const candidate = current as {
      code?: unknown;
      constraint_name?: unknown;
      constraint?: unknown;
      detail?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (
      typeof candidate.code === "string" &&
      /^[0-9A-Z]{5}$/u.test(candidate.code)
    ) {
      const message =
        typeof candidate.message === "string" ? candidate.message : "";
      const named = candidate.constraint_name ?? candidate.constraint;
      const quoted = /constraint "([^"]+)"/u.exec(message)?.[1] ?? null;
      return {
        code: candidate.code,
        constraint: typeof named === "string" ? named : quoted,
        message,
        detail: typeof candidate.detail === "string" ? candidate.detail : "",
      };
    }
    current = candidate.cause;
  }
  return null;
}

/** The SHA a `projectReportCommits_sha_key` violation names, when the driver says. */
export function conflictingSha(error: unknown): string | null {
  const failure = pgFailure(error);
  if (!failure) return null;
  return /\(sha\)=\(([0-9a-f]{40})\)/u.exec(failure.detail)?.[1] ?? null;
}

export const UNIQUE_VIOLATION = "23505";

/** Whether the error is a unique violation of the named constraint or index. */
export function isUniqueViolationOf(error: unknown, constraint: string) {
  const failure = pgFailure(error);
  return (
    failure?.code === UNIQUE_VIOLATION &&
    (failure.constraint === constraint ||
      failure.message.includes(`"${constraint}"`))
  );
}

/**
 * The guard triggers raise plain messages (`guard_project_structure`,
 * `validate_report_commit`). The store pre-checks these cases, so reaching one
 * means a race; the member gets the same words the pre-check would have used.
 */
const GUARD_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  [
    "At most ten project repository links",
    "A project links at most 10 repositories.",
  ],
  [
    "Repository link supports report citations",
    "Reports cite commits from that repository, so its link has to stay.",
  ],
  [
    "Cannot remove the docs repository link",
    "That repository carries the project's docs, so its link has to stay.",
  ],
  [
    "Project cannot be deleted",
    "A project with reports or submissions, or a DevDogs-owned one, cannot be deleted.",
  ],
  ["DevDogs ownership is irreversible", "DevDogs ownership cannot be undone."],
  [
    "An active project needs at least one approved repository link",
    "A project needs at least one approved repository before it can be active.",
  ],
  [
    "A report needs at least one cited commit",
    "A report needs at least one cited commit.",
  ],
  [
    "Commit author, provenance, approved project link or Eastern date is ineligible",
    "One of the cited commits is not yours, not in this project's repositories, or outside your date range.",
  ],
];

/** The member-facing sentence for a guard trigger's refusal, or null. */
export function guardMessage(error: unknown): string | null {
  const failure = pgFailure(error);
  if (!failure) return null;
  const hit = GUARD_MESSAGES.find(([raised]) =>
    failure.message.includes(raised),
  );
  return hit ? hit[1] : null;
}
