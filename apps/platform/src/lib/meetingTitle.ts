import { EVENT_TZ } from "./eventTime";

/**
 * What to call a meeting, for the places that need a string rather than a row
 * of chips.
 *
 * `meetings.nameOverride` is nullable and usually null: a sprint Monday is
 * described by its workshops and its judging, and an officer retyping that in
 * prose every week was the duplication the rename removed. The schedule renders
 * no heading for such a night at all. The chips and the workshop list *are* the
 * row.
 *
 * But four callers cannot render nothing:
 *
 * - the page `<title>`, which would otherwise read " | DevDogs";
 * - `eventLd`'s `Event.name`, which Google's rich-result guidelines require
 *   for these URLs to appear as events rather than as pages;
 * - the route dialog's `DialogTitle`, the accessible name Radix announces,
 *   which today falls back to "Meeting not found", a sentence that would start
 *   appearing over meetings that were found;
 * - the stars grid and the CSV export, which identify a night in a table.
 *
 * So the heading still EXISTS; it is simply not painted on the schedule. This
 * is the one place it is computed, so the tab, the search result, the screen
 * reader and the export cannot drift apart.
 *
 * ## Deliberately not the slug
 *
 * A slug is a permanent URL and this string moves: add a workshop and it
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

/** "Monday, September 21", the identifier every meeting always has. */
function dateTitle(at: Date): string {
  return WEEKDAY_DATE.format(at);
}

/**
 * The word a row prints for a workshop. Total: there is always something.
 *
 * The fallback used to live at the call sites as `workshopLabel(x) ??
 * "Workshop"`, copy-pasted at four of them, while `ScheduleList`'s own comment
 * asserted that "the schedule and the permalink cannot print two different
 * words for one row". That invariant was held by four string literals and no
 * code, which is the same as not being held: a fifth caller renders a workshop
 * and either picks its own fallback or prints nothing.
 *
 * Making it total moved the invariant into the type. It also found the caller
 * that had never been given a fallback at all, `judgingForMeetings`, which was
 * still labelling judging nights off the project name.
 */
export function workshopLabel(workshop: TitleableWorkshop): string {
  return workshopName(workshop) ?? WORKSHOP_FALLBACK_LABEL;
}

/**
 * What a workshop is CALLED, or null when nobody has named it.
 *
 * The partial half of the pair, and it stays partial because `meetingTitle`
 * below aggregates over it. A total function here would make a workshop with
 * neither a title nor a project contribute the literal word, and the heading
 * for a night would come out "Workshop: Workshop".
 */
export function workshopName(workshop: TitleableWorkshop): string | null {
  return workshop.title ?? workshop.projectName;
}

/**
 * What an unnamed workshop is called.
 *
 * Reachable: `workshops.projectId` is nullable and `title` is optional, so a
 * session created for a skill and not yet named has neither.
 */
export const WORKSHOP_FALLBACK_LABEL = "Workshop";

/**
 * The meeting's name, in descending order of how much somebody meant it.
 *
 * 1. `nameOverride`: an officer wrote this night a name, so use it.
 * 2. `kind`: "Build Session", "Study Session". Authored, just not bespoke.
 * 3. the workshops it teaches: "Workshop: Next.js & Flutter".
 * 4. the date, always available, since `startsAt` is `not null`.
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

  // `workshopName`, not `workshopLabel`: the label is total now, so mapping
  // it here would turn an unnamed workshop into the heading "Workshop:
  // Workshop" rather than letting the night fall through to its date.
  const taught = workshops
    .map(workshopName)
    .filter((label): label is string => label !== null);

  // Two is where a heading stops being a heading. "Workshop: Next.js, Flutter
  // & Supabase" is a sentence; past that the date reads better and the agenda
  // below it carries the detail anyway.
  if (taught.length === 1) return `Workshop: ${taught[0]}`;
  if (taught.length === 2) return `Workshop: ${taught[0]} & ${taught[1]}`;

  return dateTitle(meeting.startsAt);
}
