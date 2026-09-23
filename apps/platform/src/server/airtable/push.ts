import {
  attendanceTable as attendanceSpec,
  projects as projectsSpec,
  buildPush,
  buildUpdate,
  competitions as competitionsSpec,
  meetings as meetingsSpec,
  members as membersSpec,
  platformSettingsTable as settingsSpec,
  mergeOn,
  statusField,
  teamsTable as teamsSpec,
  workshops as workshopsSpec,
  type AirtableClient,
  type AirtableRecord,
  type AttendanceRow,
  type CompetitionRow,
  type MeetingRow,
  type MemberRow,
  type PlatformSettingsRow,
  type TableSpec,
  type TeamRow,
  type WorkshopRow,
} from "@devdogsuga/airtable";
import { eq, isNull, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  attendance,
  competitions,
  meetings,
  profiles,
  reflectionSettings,
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
      preferredName: profiles.preferredName,
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
 * Mirrors authoritative attendance into Airtable for officer reporting.
 *
 * Link fields require Airtable record IDs rather than platform UUIDs. Meetings
 * retain that ID when pulled; members are resolved from the records listed
 * after the member push so a first-sign-in account can be linked immediately.
 */
export async function pushAttendance(
  client: AirtableClient,
  existing: AirtableRecord[],
  existingMembers: AirtableRecord[],
): Promise<PushCounts> {
  const memberRecordIdByUserId = new Map<string, string>();
  for (const record of existingMembers) {
    const userId = record.fields[membersSpec.fields.platformId.id];
    if (typeof userId === "string") {
      memberRecordIdByUserId.set(userId, record.id);
    }
  }

  const records = await db
    .select({
      id: attendance.id,
      userId: attendance.userId,
      meetingAirtableId: meetings.airtableRecordId,
      method: attendance.method,
      recordedAt: sql<string>`${attendance.recordedAt}::text`,
    })
    .from(attendance)
    .innerJoin(meetings, eq(meetings.id, attendance.meetingId));

  const rows: AttendanceRow[] = [];
  for (const record of records) {
    const memberAirtableId = memberRecordIdByUserId.get(record.userId);
    if (memberAirtableId === undefined || record.meetingAirtableId === null) {
      continue;
    }
    rows.push({
      id: record.id,
      memberAirtableId,
      meetingAirtableId: record.meetingAirtableId,
      method: record.method,
      recordedAt: record.recordedAt,
    });
  }

  return upsert<AttendanceRow>(client, attendanceSpec, rows, existing);
}

/** Creates the singleton settings row with defaults; later edits are pulled. */
export async function ensurePlatformSettings(
  client: AirtableClient,
  existing: AirtableRecord[],
): Promise<PushCounts> {
  const key = settingsSpec.fields.platformId;
  const current = existing.find(
    (record) => record.fields[key.id] === "reflection-policy",
  );
  if (current) return { created: 0, updated: 0, unchanged: 1 };
  const [policy] = await db
    .select({
      minimumWordCount: reflectionSettings.minimumWordCount,
      submissionWindowDays: reflectionSettings.submissionWindowDays,
    })
    .from(reflectionSettings)
    .limit(1);
  const row: PlatformSettingsRow = {
    id: "reflection-policy",
    minimumWordCount: policy?.minimumWordCount ?? 100,
    submissionWindowDays: policy?.submissionWindowDays ?? 7,
  };
  const result = await client.upsertRecords(
    settingsSpec.id,
    [key.id],
    [
      {
        fields: {
          [key.id]: row.id,
          [settingsSpec.fields.minimumWordCount.id]: row.minimumWordCount,
          [settingsSpec.fields.submissionWindowDays.id]:
            row.submissionWindowDays,
        },
      },
    ],
  );
  return { ...result, unchanged: 0 };
}

/** Teams, with their entry state. */
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
      memberCount: sql<number>`(
        select count(*)::int from ${teamMembers}
        where ${teamMembers.teamId} = ${teams.id}
      )`,
    })
    .from(teams)
    .innerJoin(competitions, eq(competitions.id, teams.competitionId));

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
    platformSettings: AirtableRecord[];
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
    [settingsSpec, listed.platformSettings],
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
