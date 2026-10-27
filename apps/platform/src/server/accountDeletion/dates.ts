/**
 * Dates for a scheduled account deletion.
 *
 * Plain functions of their inputs: nothing here reads the clock, so a caller
 * passes `now` and a test passes a fixed one.
 */

/** How long a member has to change their mind (account-deletion Q4). */
export const DELETION_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a deletion scheduled at `now` becomes due. */
export function deletionDueAt(now: Date): Date {
  return new Date(now.getTime() + DELETION_WINDOW_DAYS * DAY_MS);
}

/**
 * The date as a person reads it in an email or on the pending page, in the
 * club's time zone (Eastern): "Friday, November 6, 2026". The deletion is due at
 * the same time of day it was scheduled, 14 days later; the job runs every
 * fifteen minutes, so the account goes shortly after that moment on that date.
 */
export function formatDeletionDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
