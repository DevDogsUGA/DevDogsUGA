import { meetingCardDetail, meetingLocation } from "@devdogsuga/og/event";
import type { DevtoolsClient } from "../instance.js";
import type { EventGraphicSource } from "./graphics.js";

/**
 * Meetings, for the one group of graphics that cannot be drawn from the repo.
 *
 * Every other graphic is a function of committed files. An event poster is a
 * function of a row that arrives from Airtable through a sync, so
 * `devtools images event/*` needs a running database that has recently been
 * synced — and there is nothing about typing a command that makes that
 * obvious. Making it obvious is most of what this file is for: the reads are
 * small, and {@link EventReader.syncState} exists so the command can say which
 * database it is looking at and how old the answer is BEFORE it renders
 * anything that might be posted somewhere public.
 *
 * Reads go through `adminClient`, the same service-role client every other
 * database command here uses, so `--local | --remote | --team` means what it
 * already means. `platform` is exposed to PostgREST (`supabase/config.toml`),
 * and the service role bypasses the RLS that otherwise keeps
 * `airtableSyncState` closed to every client.
 */

/** What the Airtable sync last did, as the officer console shows it. */
export interface SyncState {
  lastSyncedAt: Date | null;
  lastStatus: string | null;
  rowsRefused: number;
}

/** The seam the command talks to, so tests never open a socket. */
export interface EventReader {
  syncState(): Promise<SyncState | null>;
  meetings(): Promise<EventGraphicSource[]>;
}

/** How old a sync gets before the CLI stops calling the data current. */
export const STALE_AFTER_HOURS = 48;

export function hoursSince(at: Date | null): number | null {
  return at === null ? null : (Date.now() - at.getTime()) / 3_600_000;
}

/** "19 days", "3 hours" — for a warning somebody has to read quickly. */
export function describeAge(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 48)
    return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;

  return `${Math.round(hours / 24)} days`;
}

interface MeetingRow {
  id: string;
  slug: string;
  nameOverride: string | null;
  kind: string | null;
  building: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

interface WorkshopRow {
  meetingId: string;
  title: string | null;
  projects: { displayName: string; sortOrder: number | null } | null;
}

export function supabaseEvents(client: DevtoolsClient): EventReader {
  return {
    async syncState() {
      const { data, error } = await client
        .from("airtableSyncState")
        .select("lastSyncedAt, lastStatus, rowsRefused")
        .maybeSingle();

      if (error)
        throw new Error(`Could not read the sync state: ${error.message}`);
      if (!data) return null;

      const row = data as {
        lastSyncedAt: string | null;
        lastStatus: string | null;
        rowsRefused: number;
      };

      return {
        lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt) : null,
        lastStatus: row.lastStatus,
        rowsRefused: row.rowsRefused,
      };
    },

    async meetings() {
      // Cancelled nights are included deliberately: a cancellation is exactly
      // when somebody needs a fresh graphic, and the card has a layout for it.
      // Deleted ones are not.
      const [meetings, workshops] = await Promise.all([
        client
          .from("meetings")
          .select(
            "id, slug, nameOverride, kind, building, location, startsAt, endsAt, cancelledAt, cancellationReason",
          )
          .is("deletedAt", null)
          .order("startsAt", { ascending: false }),
        client
          .from("workshops")
          .select("meetingId, title, projects(displayName, sortOrder)")
          .is("deletedAt", null),
      ]);

      if (meetings.error)
        throw new Error(`Could not read meetings: ${meetings.error.message}`);
      if (workshops.error) {
        throw new Error(`Could not read workshops: ${workshops.error.message}`);
      }

      const agendas = groupAgendas(
        (workshops.data ?? []) as unknown as WorkshopRow[],
      );

      return ((meetings.data ?? []) as unknown as MeetingRow[]).map((row) => {
        const agenda = agendas.get(row.id) ?? [];
        const meeting = {
          slug: row.slug,
          startsAt: new Date(row.startsAt),
          endsAt: new Date(row.endsAt),
          building: row.building,
          location: row.location,
          kind: row.kind,
          cancelledAt: row.cancelledAt ? new Date(row.cancelledAt) : null,
          cancellationReason: row.cancellationReason,
        };

        return {
          slug: row.slug,
          hint: describeMeeting(meeting),
          detail: meetingCardDetail({
            meeting,
            title: meetingTitle(
              row.nameOverride,
              row.kind,
              meeting.startsAt,
              agenda,
            ),
            agenda,
            location: meetingLocation(row.building, row.location),
          }),
        };
      });
    },
  };
}

/**
 * Workshop labels per meeting, in the order the app shows them.
 *
 * `projects.sortOrder` first, then the project's name, then the workshop's own
 * title — the ordering `getMeetingWorkshops` uses, so an agenda here reads the
 * same way it does on the page. A workshop with no project keeps its own title
 * and sorts last, which is what `nulls last` does there.
 */
function groupAgendas(rows: readonly WorkshopRow[]): Map<string, string[]> {
  const byMeeting = new Map<string, WorkshopRow[]>();

  for (const row of rows) {
    const list = byMeeting.get(row.meetingId) ?? [];
    list.push(row);
    byMeeting.set(row.meetingId, list);
  }

  const agendas = new Map<string, string[]>();

  for (const [meetingId, list] of byMeeting) {
    const labels = list
      .sort((a, b) => {
        const order =
          (a.projects?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.projects?.sortOrder ?? Number.MAX_SAFE_INTEGER);
        if (order !== 0) return order;

        return (
          (a.projects?.displayName ?? "").localeCompare(
            b.projects?.displayName ?? "",
          ) || (a.title ?? "").localeCompare(b.title ?? "")
        );
      })
      .map((row) => row.title ?? row.projects?.displayName ?? null)
      .filter((label): label is string => label !== null);

    agendas.set(meetingId, labels);
  }

  return agendas;
}

/**
 * The meeting's name, in descending order of how much somebody meant it.
 *
 * Mirrors `apps/platform/src/lib/meetingTitle.ts`: an authored name, then the
 * kind, then the workshops it teaches, then the date. Two named workshops read
 * as a heading; three do not, and the date carries it while the agenda below
 * shows the detail.
 *
 * Duplicated rather than imported because it lives in the Next app, which this
 * package cannot depend on. `events.test.ts` pins the chain so a change to one
 * shows up as a failure rather than as a differently-titled poster.
 */
export function meetingTitle(
  nameOverride: string | null,
  kind: string | null,
  startsAt: Date,
  agenda: readonly string[],
): string {
  if (nameOverride !== null) return nameOverride;
  if (kind !== null) return kind;
  if (agenda.length === 1) return `Workshop: ${agenda[0]}`;
  if (agenda.length === 2) return `Workshop: ${agenda[0]} & ${agenda[1]}`;

  return startsAt.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "long",
  });
}

/** One line for the picker: when it is, and whether it is still on. */
function describeMeeting(meeting: {
  startsAt: Date;
  cancelledAt: Date | null;
}): string {
  const when = meeting.startsAt.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
  });

  return meeting.cancelledAt === null ? when : `${when}, cancelled`;
}
