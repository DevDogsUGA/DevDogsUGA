import {
  attendanceTable as attendanceSpec,
  projects as projectsSpec,
  buildPush,
  buildUpdate,
  competitions as competitionsSpec,
  meetings as meetingsSpec,
  members as membersSpec,
  mergeOn,
  statusField,
  teamsTable as teamsSpec,
  workshops as workshopsSpec,
  type AirtableClient,
  type AirtableRecord,
  type CompetitionRow,
  type MeetingRow,
  type MemberRow,
  type TableSpec,
  type TeamRow,
  type WorkshopRow,
} from "@devdogsuga/airtable";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  attendance,
  competitions,
  competitionStandings,
  meetings,
  profiles,
  teamMembers,
  teams,
  workshops,
} from "~/server/db/schema";
import type { Refusal } from "./refusals";

/**
 * The push half: derived values the platform owns exclusively.
 *
 * One rule governs everything here: **push only fields the platform owns
 * exclusively, and never create a field both sides write.** A field with two
 * writers has no way to resolve a conflict, and last-writer-wins destroys
 * somebody's work silently, weeks later.
 *
 * Which write verb each table gets follows from who authors it, not from
 * convenience:
 *
 *   * Members, Projects, Teams: the platform authors these, so a row with no
 *     Airtable record should create one. Upsert on `⚙️ Platform ID`.
 *   * Meetings, Workshops, Competitions: Airtable authors these. The platform
 *     only writes derived values onto rows that already exist, addressed by
 *     record id. Upserting them would create a duplicate record for every row
 *     whose Platform ID is still blank.
 */

export interface PushCounts {
  created: number;
  updated: number;
  unchanged: number;
}

function noCounts(): PushCounts {
  return { created: 0, updated: 0, unchanged: 0 };
}

// ── Platform-authored tables (upsert) ────────────────────────────────────────

export async function pushMembers(
  client: AirtableClient,
  existing: AirtableRecord[],
): Promise<PushCounts> {
  const rows = await db
    .select({
      userId: profiles.userId,
      ugaEmail: profiles.ugaEmail,
      legalFirstName: profiles.legalFirstName,
      legalLastName: profiles.legalLastName,
      meetingCount: sql<number>`(
        select count(distinct ${attendance.meetingId})::int
        from ${attendance} where ${attendance.userId} = ${profiles.userId}
      )`,
    })
    .from(profiles);

  return upsert<MemberRow>(client, membersSpec, rows, existing);
}

/**
 * Teams, with their computed points.
 *
 * `totalPoints` comes from `competitionStandings`, which only exists once the
 * tally has run, so it is null for a live competition and that is correct. The
 * never-blank rule means a null is omitted rather than written as zero, which
 * matters here more than anywhere: a zero in that column reads as "this team
 * scored nothing", and a blank reads as "not scored yet".
 */
export async function pushTeams(
  client: AirtableClient,
  existing: AirtableRecord[],
): Promise<PushCounts> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      competitionAirtableId: competitions.airtableRecordId,
      submissionUrl: teams.submissionUrl,
      competed: sql<boolean>`${teams.competedAt} is not null`,
      totalPoints: competitionStandings.totalPoints,
      memberCount: sql<number>`(
        select count(*)::int from ${teamMembers}
        where ${teamMembers.teamId} = ${teams.id}
      )`,
    })
    .from(teams)
    .innerJoin(competitions, eq(competitions.id, teams.competitionId))
    .leftJoin(competitionStandings, eq(competitionStandings.teamId, teams.id));

  return upsert<TeamRow>(client, teamsSpec, rows, existing);
}

async function upsert<TRow>(
  client: AirtableClient,
  spec: TableSpec,
  rows: TRow[],
  existing: AirtableRecord[],
): Promise<PushCounts> {
  const plan = buildPush(spec, rows, existing);
  if (plan.records.length === 0) {
    return { created: 0, updated: 0, unchanged: plan.unchanged };
  }

  const result = await client.upsertRecords(
    spec.id,
    mergeOn(spec),
    plan.records,
  );
  return { ...result, unchanged: plan.unchanged };
}

// ── Airtable-authored tables (update by record id) ───────────────────────────

/**
 * Derived counts written back onto officer-authored rows.
 *
 * Each of these is a number an officer plans against: how many people came,
 * how full a competition is. Each is a projection of attendance or membership
 * that Airtable has no way to compute for itself.
 */
export async function pushDerivedCounts(
  client: AirtableClient,
  listed: {
    meetings: AirtableRecord[];
    workshops: AirtableRecord[];
    competitions: AirtableRecord[];
  },
): Promise<PushCounts> {
  const meetingRows = await db
    .select({
      id: meetings.id,
      slug: meetings.slug,
      nameOverride: meetings.nameOverride,
      location: meetings.location,
      startsAt: sql<string>`${meetings.startsAt}::text`,
      endsAt: sql<string>`${meetings.endsAt}::text`,
      attendanceFormUrl: meetings.attendanceFormUrl,
      airtableRecordId: meetings.airtableRecordId,
      attendanceCount: sql<number>`(
        select count(*)::int from ${attendance}
        where ${attendance.meetingId} = ${meetings.id}
      )`,
    })
    .from(meetings)
    .where(isNull(meetings.deletedAt));

  const workshopRows = await db
    .select({
      id: workshops.id,
      meetingAirtableId: sql<string | null>`null`,
      projectAirtableId: sql<string | null>`null`,
      airtableRecordId: workshops.airtableRecordId,
      attendanceCount: sql<number>`(
        select count(*)::int from ${attendance}
        where ${attendance.workshopId} = ${workshops.id}
      )`,
    })
    .from(workshops)
    .where(isNull(workshops.deletedAt));

  const competitionRows = await db
    .select({
      id: competitions.id,
      slug: competitions.slug,
      workshopAirtableId: sql<string | null>`null`,
      judgingStartsAt: sql<
        string | null
      >`${competitions.judgingStartsAt}::text`,
      airtableRecordId: competitions.airtableRecordId,
      teamCount: sql<number>`(
        select count(*)::int from ${teams}
        where ${teams.competitionId} = ${competitions.id}
      )`,
    })
    .from(competitions)
    .where(isNull(competitions.deletedAt));

  const total = noCounts();

  for (const [spec, rows, records] of [
    [meetingsSpec, meetingRows, listed.meetings],
    [workshopsSpec, workshopRows, listed.workshops],
    [competitionsSpec, competitionRows, listed.competitions],
  ] as [TableSpec, { airtableRecordId: string | null }[], AirtableRecord[]][]) {
    const entries = rows
      .filter((r) => r.airtableRecordId !== null)
      .map((r) => ({ recordId: r.airtableRecordId!, row: r }));

    const plan = buildUpdate(spec, entries, records);
    total.unchanged += plan.unchanged;
    if (plan.records.length === 0) continue;

    total.updated += await client.updateRecords(spec.id, plan.records);
  }

  return total;
}

// Types are asserted rather than inferred above because each `select` builds
// the registry's row shape by hand; these keep the two in step.
type _MeetingRowCheck = MeetingRow;
type _WorkshopRowCheck = WorkshopRow;
type _CompetitionRowCheck = CompetitionRow;

// ── Requirements met (the one pull on a pushed table) ────────────────────────

/**
 * Reads `Requirements met` back into `teams.requirementsMet`.
 *
 * The Teams table is the one place both directions meet, and it is legal
 * because direction is per field: the grade is an input the platform reads,
 * the points are an output the platform writes. Do not add the obvious
 * Airtable formula between them. A formula computing points from the grade
 * would put the scoring rule in two places that will drift.
 *
 * Refused outright for teams whose competition is finalized, for the same
 * reason `requirementCount` is: the score is published.
 */
export async function pullTeamGrades(
  records: AirtableRecord[],
): Promise<number> {
  const gradeField = teamsSpec.fields.requirementsMet;
  const keyField = teamsSpec.fields.platformId;
  let updated = 0;

  for (const record of records) {
    const teamId = record.fields[keyField.id];
    const grade = record.fields[gradeField.id];
    if (typeof teamId !== "string" || typeof grade !== "number") continue;

    const rows = await db
      .update(teams)
      .set({ requirementsMet: grade })
      .where(
        and(
          eq(teams.id, teamId),
          sql`${teams.requirementsMet} is distinct from ${grade}`,
          sql`not exists (
            select 1 from ${competitionStandings}
            where ${competitionStandings.competitionId} = ${teams.competitionId}
          )`,
        ),
      )
      .returning({ id: teams.id });

    updated += rows.length;
  }

  return updated;
}

// ── Sync status write-back ───────────────────────────────────────────────────

/**
 * Puts each refusal in the row it came from, and clears the ones that are
 * resolved.
 *
 * Without this, a refused edit looks to the officer exactly like a sync that
 * has not run yet, and the next move is to make the same edit again.
 *
 * Clearing is the half that makes it trustworthy. A stale refusal sitting in
 * the grid after the officer fixed the row reads as a live problem forever,
 * which is why `Sync status` is a `.status()` field rather than an ordinary
 * push: it is the one field the engine is allowed to blank.
 */
export async function writeSyncStatus(
  client: AirtableClient,
  refusals: Refusal[],
  listed: {
    projects: AirtableRecord[];
    meetings: AirtableRecord[];
    workshops: AirtableRecord[];
    competitions: AirtableRecord[];
    attendance: AirtableRecord[];
  },
): Promise<number> {
  const byRecord = new Map<string, string[]>();
  for (const refusal of refusals) {
    const existing = byRecord.get(refusal.airtableRecordId) ?? [];
    existing.push(refusal.message);
    byRecord.set(refusal.airtableRecordId, existing);
  }

  const tables: [TableSpec, AirtableRecord[]][] = [
    // Projects joined this list when the table stopped being pushed. Without
    // it a refused project name computes a refusal and then drops it, which is
    // the silence the whole `⚙️ Sync status` field exists to end.
    [projectsSpec, listed.projects],
    [meetingsSpec, listed.meetings],
    [workshopsSpec, listed.workshops],
    [competitionsSpec, listed.competitions],
    // Attendance carries the refusals a MEMBER caused rather than an officer:
    // a mistyped MyID, a workshop that is not in the base. Omitting it here
    // would compute those refusals and then drop them, so the response stays
    // unimported and nothing in the grid says why, which is worse than having
    // no rule at all.
    [attendanceSpec, listed.attendance],
  ];

  let written = 0;

  for (const [spec, records] of tables) {
    const status = statusField(spec);
    if (!status) continue;

    const updates: { id: string; fields: Record<string, string> }[] = [];

    for (const record of records) {
      const desired = (byRecord.get(record.id) ?? []).join("\n\n");
      const current = record.fields[status.id];
      const currentText = typeof current === "string" ? current : "";
      // Change detection here too, so an untouched grid does not show every
      // row as freshly modified. That would destroy "sort by last modified" as
      // a way to find what an officer changed.
      if (currentText === desired) continue;
      updates.push({ id: record.id, fields: { [status.id]: desired } });
    }

    if (updates.length > 0) {
      written += await client.updateRecords(spec.id, updates);
    }
  }

  return written;
}
