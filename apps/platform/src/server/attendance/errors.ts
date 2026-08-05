/**
 * Check-in failures, outside the action file.
 *
 * Not merely tidier — **a `"use server"` module may only export async
 * functions.** A class or a const exported alongside the actions is a build
 * error, and it is a latent one: the rule fires when the module is first
 * compiled, so an action file nothing imports yet passes every check until the
 * page that uses it is written. `CheckInError` sat in `actions/attendance.ts`
 * from the day it was written and only became a problem when the meeting page
 * became its first importer.
 *
 * `server/teams/errors.ts` is the same pattern for the same reason.
 */

export type CheckInCode =
  /** No code matched. Wrong code, or one that has already rotated away. */
  | "code_not_found"
  /** The code's rotation window or the meeting's check-in window has closed. */
  | "check_in_closed"
  /** Already attended this meeting. A no-op, not a failure. */
  | "already_checked_in";

export class CheckInError extends Error {
  readonly code: CheckInCode;

  constructor(code: CheckInCode, message?: string) {
    super(message ?? code);
    this.name = "CheckInError";
    this.code = code;
  }
}

/**
 * What `checkIn` returns.
 *
 * A result rather than a thrown error, matching `castBallot`. The reason is
 * not style: an error thrown inside a server action does not survive to the
 * client in a production build — React replaces the message with a generic
 * digest — so a client branching on `error.code` works in development and
 * silently degrades to "something went wrong" in production. That is the worst
 * possible failure mode for the one screen a member uses while standing in a
 * room waiting to be counted.
 */
export type CheckInOutcome =
  | { ok: true; meetingId: string; workshopId: string | null }
  | { ok: false; error: CheckInCode };
