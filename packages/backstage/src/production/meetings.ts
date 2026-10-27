/**
 * Naming a meeting on the command line: `--meeting <day|slug|uuid>`.
 *
 * Slugs are the meeting's Eastern date (`2026-09-09`), with `-2` for a second
 * meeting that day, so a day is how officers will usually name one. A day with
 * two meetings is ambiguous and the error lists both slugs rather than picking.
 */
import { UsageError } from "@devdogsuga/cli-core/ui";
import { withConnection, type Sql } from "./access.js";
import { dayOf, EVENT_TZ, isDay } from "./time.js";

export interface Meeting {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
  hasWorkshop: boolean;
}

/** Live meetings an argument could mean: by id or slug, or on that Eastern day. */
export const MEETING_QUERY = `
select
  m."id"::text as "id",
  m."slug",
  coalesce(m."nameOverride", 'Meeting') as "title",
  m."startsAt",
  m."endsAt",
  m."cancelledAt",
  "platform".meeting_has_workshop(m."id") as "hasWorkshop"
from "platform"."meetings" m
where m."deletedAt" is null
  and (
    m."id"::text = $1 or m."slug" = $1
    or ($2::boolean and (m."startsAt" at time zone '${EVENT_TZ}')::date = $1::date)
  )
order by m."startsAt"
`;

export type FindMeetings = (named: string) => Promise<Meeting[]>;

export function findMeetingsWith(sql: Sql): FindMeetings {
  return async (named) => {
    const rows = await sql.unsafe(MEETING_QUERY, [named, isDay(named)]);
    return rows.map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      title: String(r.title),
      startsAt: r.startsAt as Date,
      endsAt: r.endsAt as Date,
      cancelledAt: (r.cancelledAt as Date | null) ?? null,
      hasWorkshop: r.hasWorkshop === true,
    }));
  };
}

export function findMeetingsFor(url: string): FindMeetings {
  return (named) =>
    withConnection(url, "Could not read production's meetings", (sql) =>
      findMeetingsWith(sql)(named),
    );
}

/** The one meeting `named` means, or a usage error saying why there isn't one. */
export function pickMeeting(named: string, found: readonly Meeting[]): Meeting {
  const exact = found.filter((m) => m.id === named || m.slug === named);
  const candidates = exact.length > 0 ? exact : found;
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) {
    throw new UsageError(
      `No meeting matches "${named}". Name it by day (2026-09-09), slug or id.`,
    );
  }
  throw new UsageError(
    `"${named}" could be ${candidates
      .map((m) => `${m.slug} (${m.title})`)
      .join(" or ")}. Pass the slug.`,
  );
}

export function describeMeeting(m: Meeting): string {
  return `${m.title}, ${dayOf(m.startsAt)} (${m.slug})`;
}
