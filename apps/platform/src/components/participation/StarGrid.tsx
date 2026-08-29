import { formatEventDate } from "~/lib/eventTime";
import { workshopLabel } from "~/lib/meetingTitle";
import type { StarCell } from "~/server/loaders/stars";
import EmptyState from "./EmptyState";
import { StarBadges } from "./StarBadges";

/**
 * A member's participation record: one row per workshop, newest first.
 *
 * The important property is what this does NOT draw. `getStarsForUser` returns
 * a row only where something was earned — a meeting somebody skipped produces
 * no row at all, rather than a row of falses — so a grid with a line for every
 * meeting the club ever held would be inventing the failures it displayed.
 * Every row here is something the member did.
 *
 * Rows are grouped under their meeting because a meeting can run several
 * workshops, and three consecutive rows carrying the same date otherwise read
 * as three separate nights.
 *
 * The order comes from the query (`meetings.startsAt` descending) and is not
 * re-sorted here: grouping preserves first-appearance order, so the newest
 * meeting stays first without a second sort that could disagree with the first.
 */
export default function StarGrid({ cells }: { cells: StarCell[] }) {
  if (cells.length === 0) {
    return (
      <EmptyState
        title="No participation recorded yet"
        body={
          "Stars appear here after a workshop is attended or a competition is " +
          "entered. An empty record means nothing has been recorded yet — " +
          "meetings somebody did not attend never appear here at all."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Legend />

      {groupByMeeting(cells).map((meeting) => (
        <section
          key={meeting.meetingId}
          className="rounded-lg border border-white/10 bg-white/5 p-4"
        >
          {/* Null for a night nobody named and no workshop titled — an
              ordinary sprint Monday. The date is the fallback, formatted here
              rather than coalesced in SQL so `EVENT_TZ` stays in one module,
              and it becomes the heading itself rather than repeating under a
              blank one. */}
          <h3 className="font-semibold text-white">
            {meeting.meetingName ?? (
              <time dateTime={meeting.meetingStartsAt.toISOString()}>
                {formatEventDate(meeting.meetingStartsAt)}
              </time>
            )}
          </h3>
          {meeting.meetingName !== null && (
            <p className="text-xs text-mauve-400">
              <time dateTime={meeting.meetingStartsAt.toISOString()}>
                {formatEventDate(meeting.meetingStartsAt)}
              </time>
            </p>
          )}

          <ul className="mt-3 flex flex-col gap-2">
            {meeting.workshops.map((cell) => (
              <li
                key={cell.workshopId}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                {/* Not `projectName`: it is null for a skill session, which
                    left the row labelled with nothing at all. */}
                <span>{workshopLabel(cell) ?? "Workshop"}</span>
                <StarBadges
                  workshopStar={cell.workshopStar}
                  competitionStar={cell.competitionStar}
                  won={cell.won}
                  size="sm"
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * What the three marks mean, in words.
 *
 * The badges carry `title` attributes, which are a hover affordance and
 * therefore not one on a phone. Three amber stars with no key is a decoration;
 * the distinctions between them are the whole point of the model.
 */
function Legend() {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-xs text-mauve-400">
      <div className="flex gap-1.5">
        <dt aria-hidden className="text-amber-300">
          ★
        </dt>
        <dd>Attended the workshop, or competed in it</dd>
      </div>
      <div className="flex gap-1.5">
        <dt aria-hidden className="text-amber-300">
          ★
        </dt>
        <dd>Competed — the entry was frozen at judging</dd>
      </div>
      <div className="flex gap-1.5">
        <dt aria-hidden className="text-amber-300">
          ♛
        </dt>
        <dd>Won</dd>
      </div>
    </dl>
  );
}

interface MeetingGroup {
  meetingId: string;
  meetingName: string | null;
  meetingStartsAt: Date;
  workshops: StarCell[];
}

function groupByMeeting(cells: StarCell[]): MeetingGroup[] {
  const groups: MeetingGroup[] = [];
  const byId = new Map<string, MeetingGroup>();

  for (const cell of cells) {
    let group = byId.get(cell.meetingId);

    if (group === undefined) {
      group = {
        meetingId: cell.meetingId,
        meetingName: cell.meetingName,
        meetingStartsAt: cell.meetingStartsAt,
        workshops: [],
      };
      byId.set(cell.meetingId, group);
      groups.push(group);
    }

    group.workshops.push(cell);
  }

  return groups;
}
