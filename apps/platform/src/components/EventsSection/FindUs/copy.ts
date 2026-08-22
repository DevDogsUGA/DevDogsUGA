/**
 * The dialog's heading and blurb, in a plain module because both a client
 * component (the dialog) and a server one (the full /events/directions page)
 * print them — a string exported from a "use client" file reaches a server
 * component as a client reference, not a string.
 */
export const FIND_US_TITLE = "How to find us";
export const FIND_US_BLURB =
  "Every event happens in DLW 124 — the new Dining, Learning & Well-Being center on West Campus.";
