import { EVENT_TZ } from "./eventTime";

/**
 * What to call a meeting, for the surfaces that need a string rather than a
 * row of chips.
 *
 * `meetings.nameOverride` is nullable and usually null: a sprint Monday is
 * described by its workshops and its judging, and an officer retyping that in
 * prose every week was the duplication the rename removed. The schedule
 * renders no heading for such a night at all — the chips and the workshop list
 * *are* the row.
 *
 * But four surfaces cannot render nothing:
 *
 * - the page `<title>`, which would otherwise read " | DevDogs";
 * - `eventLd`'s `Event.name`, which Google's rich-result guidelines require
 *   for these URLs to surface as events rather than as pages;
 * - the route dialog's `DialogTitle`, which is the accessible name Radix
 *   announces — and which today falls back to "Meeting not found", a sentence
 *   that would start appearing over meetings that were found;
 * - the stars grid and the CSV export, which identify a night in a table.
 *
 * So the heading still EXISTS; it is simply not painted on the schedule. This
 * is the one place it is computed, so the tab, the search result, the screen
 * reader and the export cannot drift apart.
 *
 * ## Deliberately not the slug
 *
 * A slug is a permanent URL and this string moves — add a workshop and it
 * changes. `clubDateKey` is the slug source for exactly that reason.
 *
 * ## Client-safe
 *
 * Imports only `EVENT_TZ`. No clock, no database, no environment, so a client
 * component can call it.
 */

/** The fields any caller can supply, all of them nullable or plain data. */
export interface TitleableMeeting {
  nameOverride: string | null;
  kind: string | null;
  startsAt: Date;
}

/**
 * A workshop as this module needs it: whatever it is called, however that was
 * arrived at. `title` is the officer's word for the session; the project name
 * is the fallback the loader already applies.
 */
export interface TitleableWorkshop {
  title: string | null;
  projectName: string | null;
}

const WEEKDAY_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** "Monday, September 21" — the identifier every meeting always has. */
function dateTitle(at: Date): string {
  return WEEKDAY_DATE.format(at);
}

/** What a workshop is called: the officer's title, else its project. */
export function workshopLabel(workshop: TitleableWorkshop): string | null {
  return workshop.title ?? workshop.projectName;
}

/**
 * The meeting's name, in descending order of how much somebody meant it.
 *
 * 1. `nameOverride` — an officer wrote this night a name, so use it.
 * 2. `kind` — "Build session", "Study session". Authored, just not bespoke.
 * 3. the workshops it teaches — "Workshop: Next.js & Flutter".
 * 4. the date — always available, since `startsAt` is `not null`.
 *
 * `workshops` is optional because two callers genuinely do not have it: the
 * stars grid and the CSV export select a meeting row without its agenda, and
 * widening their queries to build a string would be a join per row for a label.
 * Those fall through to a kind or a date, which is the right answer for a
 * table that already shows the date in the next column.
 */
export function meetingTitle(
  meeting: TitleableMeeting,
  workshops: readonly TitleableWorkshop[] = [],
): string {
  if (meeting.nameOverride !== null) return meeting.nameOverride;
  if (meeting.kind !== null) return meeting.kind;

  const taught = workshops
    .map(workshopLabel)
    .filter((label): label is string => label !== null);

  // Two is where a heading stops being a heading. "Workshop: Next.js, Flutter
  // & Supabase" is a sentence; past that the date reads better and the agenda
  // below it carries the detail anyway.
  if (taught.length === 1) return `Workshop: ${taught[0]}`;
  if (taught.length === 2) return `Workshop: ${taught[0]} & ${taught[1]}`;

  return dateTitle(meeting.startsAt);
}
