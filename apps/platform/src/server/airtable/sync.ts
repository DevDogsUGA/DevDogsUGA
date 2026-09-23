import {
  applyPull,
  competitions as competitionsSpec,
  platformSettingsTable as settingsSpec,
  type AirtableRecord,
} from "@devdogsuga/airtable";
import { and, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  competitions,
  meetings,
  reflectionSettings,
  workshops,
} from "~/server/db/schema";
import {
  checkCompetition,
  checkCompetitionValues,
  type Refusal,
} from "./refusals";

/**
 * The pull half of the sync: Airtable is the CMS for competitions, so this is
 * where officer edits become platform rows.
 *
 * Meetings, workshops and projects lost their pulls with the config-as-code
 * cutover -- see `server/config/reconcile.ts`, which replaced them and ports
 * the same three properties this file used to carry for all four tables:
 *
 *   * **Identity is a stable id, never the name or slug.** For config it is
 *     the authored `configId`; here it remains the Airtable record id.
 *
 *   * **A missing record is an archive, never a delete.** Attendance is a
 *     record of who was in a room on a Tuesday, and no amount of "I deleted
 *     the wrong row" erases that.
 *
 * Competitions stay Airtable-authored until the git-native competitions
 * rework (see the platform redesign plan), so this file is now scoped to
 * them and to the one settings singleton.
 */

export interface PullCounts {
  upserted: number;
  archived: number;
  skipped: number;
}

export interface PullOutcome extends PullCounts {
  refusals: Refusal[];
  /** Airtable record id → platform uuid, for the tables downstream of this one. */
  idMap: Map<string, string>;
}

/** Pulls the one globally configurable reflection policy row. */
export async function pullReflectionSettings(
  records: AirtableRecord[],
): Promise<PullOutcome> {
  const out = emptyOutcome();
  const parsed = applyPull<{
    minimumWordCount: number | null;
    submissionWindowDays: number | null;
  }>(settingsSpec, records).find(
    (record) => record.platformId === "reflection-policy",
  );
  if (!parsed) {
    out.skipped += 1;
    return out;
  }
  out.idMap.set(parsed.airtableRecordId, "reflection-policy");
  const invalid = [
    parsed.values.minimumWordCount === null ? "Minimum words" : null,
    parsed.values.submissionWindowDays === null
      ? "Submission window days"
      : null,
  ].filter((value): value is string => value !== null);
  if (invalid.length > 0) {
    out.skipped += 1;
    out.refusals.push({
      table: "platformSettings",
      airtableRecordId: parsed.airtableRecordId,
      code: "reflection_settings_invalid",
      message: `${invalid.join(" and ")} must be positive whole numbers. The previous global reflection policy is still active.`,
    });
    return out;
  }
  await db
    .update(reflectionSettings)
    .set({
      minimumWordCount: parsed.values.minimumWordCount!,
      submissionWindowDays: parsed.values.submissionWindowDays!,
      airtableRecordId: parsed.airtableRecordId,
      updatedAt: new Date(),
    })
    .where(eq(reflectionSettings.id, true));
  out.upserted += 1;
  return out;
}

function emptyOutcome(): PullOutcome {
  return {
    upserted: 0,
    archived: 0,
    skipped: 0,
    refusals: [],
    idMap: new Map(),
  };
}

/**
 * One row's write, contained.
 *
 * Every rule in `refusals.ts` exists to stop a bad cell reaching Postgres, and
 * each one is a rule somebody had to think of first. This is the answer for
 * the ones nobody has thought of yet.
 *
 * The pull had no `try` anywhere in it, so a constraint violation on a single
 * row unwound out of the loop, past the tables that had not run yet, and into
 * the one whole-pass catch in `run.ts`, which also skipped `writeSyncStatus`.
 * One officer typing one wrong character therefore stopped meetings,
 * workshops, competitions, attendance and both pushes, and reported NOTHING:
 * no refusal for any table reached Airtable, `syncedAt` stayed null, and the
 * grid looked clean. The failure was invisible from the only place anyone
 * would look.
 *
 * Containing it here makes the blast radius one row. The other rows in the
 * pass apply, the tables downstream still run, and the row that failed says so
 * in its own status cell, which is where the officer who edited it is already
 * looking.
 */
async function tryWrite<T>(
  out: PullOutcome,
  table: Refusal["table"],
  airtableRecordId: string,
  write: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await write() };
  } catch (error) {
    out.skipped += 1;
    out.refusals.push({
      table,
      airtableRecordId,
      code: "row_write_failed",
      message:
        "This row could not be saved, so nothing on it has changed on the " +
        "site. The rest of the sync ran normally. Check the values in this " +
        "row - a date, a number or a length is the usual cause - and if it " +
        "still fails after an edit, an officer needs to look at the logs. " +
        `The database said: ${describeWriteError(error)}`,
    });
    return { ok: false };
  }
}

/** The database's own words, trimmed to something an officer can read. */
function describeWriteError(error: unknown): string {
  // Narrowed rather than `String(error)`: a thrown object stringifies to
  // "[object Object]", which would put that in an officer's status cell as
  // though it were the database's explanation.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown error";
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 199)}…` : oneLine;
}

// ── Competitions ─────────────────────────────────────────────────────────────

interface CompetitionValues {
  slug: string | null;
  title: string | null;
  workshop: string | null;
  judgingStartsAt: string | null;
  countsTowardProgress: boolean;
  elEligible: boolean;
}

export async function pullCompetitions(
  records: AirtableRecord[],
): Promise<PullOutcome> {
  const out = emptyOutcome();
  const parsed = applyPull<CompetitionValues>(competitionsSpec, records);

  // Workshop platform uuid, keyed by the workshop's `configId` -- which, for
  // every workshop migrated out of Airtable, IS its old Airtable record id
  // (see `@devdogsuga/club-config`'s data). A competition's `workshop` link
  // field still names that same Airtable record id, so this resolves it
  // without workshops needing a pull of their own any more.
  const workshopIdsByConfigId = new Map(
    (
      await db
        .select({ id: workshops.id, configId: workshops.configId })
        .from(workshops)
        .where(and(isNotNull(workshops.configId), isNull(workshops.deletedAt)))
    ).map((w) => [w.configId!, w.id]),
  );

  const existing = await db
    .select({
      id: competitions.id,
      airtableRecordId: competitions.airtableRecordId,
      judgingStartsAt: competitions.judgingStartsAt,
      workshopMeetingStartsAt: meetings.startsAt,
      // ⚠️ Always false. See the doc on `CompetitionFacts.participationFrozen`
      // in `refusals.ts`: the platform redesign's teams-core step dropped
      // the columns this used to be computed from, so `judgingStartsAt` can
      // move freely for now, even after judging, until the competitions step
      // reintroduces a freeze signal.
      participationFrozen: sql<boolean>`false`,
    })
    .from(competitions)
    .innerJoin(workshops, eq(workshops.id, competitions.workshopId))
    .innerJoin(meetings, eq(meetings.id, workshops.meetingId));

  const byRecordId = new Map(
    existing
      .filter((c) => c.airtableRecordId !== null)
      .map((c) => [c.airtableRecordId!, c]),
  );

  // The raw title cell, for the same reason the meetings pass needed it: the
  // parser returns null for "empty" and for "too long to publish", and only
  // the second is worth a message.
  const rawByRecordId = new Map(records.map((r) => [r.id, r.fields]));

  for (const record of parsed) {
    const v = record.values;
    const workshopId = v.workshop
      ? (workshopIdsByConfigId.get(v.workshop) ?? null)
      : null;
    const judgingStartsAt = v.judgingStartsAt
      ? new Date(v.judgingStartsAt)
      : null;
    const current = byRecordId.get(record.airtableRecordId);

    const raw = rawByRecordId.get(record.airtableRecordId) ?? {};
    const valueRules = checkCompetitionValues({
      airtableRecordId: record.airtableRecordId,
      rawTitle: raw[competitionsSpec.fields.title.id],
      title: v.title,
    });
    out.refusals.push(...valueRules.refusals);

    if (current) {
      const rules = checkCompetition(
        {
          airtableRecordId: record.airtableRecordId,
          participationFrozen: current.participationFrozen,
          currentJudgingStartsAt: current.judgingStartsAt,
          workshopMeetingStartsAt: current.workshopMeetingStartsAt,
        },
        { judgingStartsAt },
      );
      out.refusals.push(...rules.refusals);

      const values: Record<string, unknown> = {
        countsTowardProgress: v.countsTowardProgress,
        elEligible: v.elEligible,
        // Null MEANS cleared here and reverts the heading to the workshop's
        // title, exactly as the workshop title reverts to the project's. The
        // one null that must not be written is an over-length title the parser
        // refused, which `checkCompetitionValues` flags so the deleted key
        // below preserves whatever is published.
        title: v.title,
      };
      if (valueRules.rejectedFields.has("title")) delete values.title;
      if (v.slug !== null) values.slug = v.slug;
      if (
        judgingStartsAt !== null &&
        !rules.rejectedFields.has("judgingStartsAt")
      ) {
        values.judgingStartsAt = judgingStartsAt;
      }

      out.idMap.set(record.airtableRecordId, current.id);

      if (Object.keys(values).length === 0) {
        out.skipped += 1;
        continue;
      }

      const written = await tryWrite(
        out,
        "competitions",
        record.airtableRecordId,
        () =>
          db
            .update(competitions)
            .set(values)
            .where(eq(competitions.id, current.id)),
      );
      if (written.ok) out.upserted += 1;
      continue;
    }

    // Hoisted to a const before the guard, rather than narrowed in place.
    // The insert below runs inside a callback now, and TypeScript discards a
    // narrowing on a mutable property across a function boundary: `v.slug`
    // would be `string | null` again by the time it is read.
    const slug = v.slug;
    if (workshopId === null || slug === null) {
      out.skipped += 1;
      continue;
    }

    // A brand-new competition gets `judgingStartsAt` unvalidated against the
    // workshop meeting on purpose: the rule guards against MOVING it, and on
    // creation the officer may not have linked the workshop and set the time
    // in the same edit. The next pass sees it as a change and applies the rule
    // then, when both halves are present.
    const written = await tryWrite(
      out,
      "competitions",
      record.airtableRecordId,
      () =>
        db
          .insert(competitions)
          .values({
            slug,
            workshopId,
            // Omitted when the parser refused it, for the reason the workshop
            // insert omits its own: writing a value the check constraint
            // rejects would throw, and the refusal already said why.
            title: valueRules.rejectedFields.has("title") ? null : v.title,
            judgingStartsAt,
            countsTowardProgress: v.countsTowardProgress,
            elEligible: v.elEligible,
            airtableRecordId: record.airtableRecordId,
          })
          .returning({ id: competitions.id }),
    );

    const inserted = written.ok ? written.value[0] : undefined;
    if (inserted) {
      out.idMap.set(record.airtableRecordId, inserted.id);
      out.upserted += 1;
    }
  }

  out.archived = await archiveMissing(
    competitions,
    parsed.map((p) => p.airtableRecordId),
  );

  return out;
}

// ── Archival ─────────────────────────────────────────────────────────────────

type ArchivableTable = typeof competitions;

/**
 * Deletion in Airtable is a soft archive here, never a hard delete.
 *
 * Scoped to rows that HAVE an `airtableRecordId`: a row created inside the
 * platform has never been in Airtable, so its absence from the fetch says
 * nothing at all. Without that guard the first pass would archive everything
 * the platform authored.
 */
async function archiveMissing(
  table: ArchivableTable,
  presentRecordIds: string[],
): Promise<number> {
  const live = and(
    isNull(table.deletedAt),
    sql`${table.airtableRecordId} is not null`,
  );

  const rows = await db
    .update(table)
    .set({ deletedAt: sql`now()` })
    .where(
      presentRecordIds.length === 0
        ? live
        : and(live, notInArray(table.airtableRecordId, presentRecordIds)),
    )
    .returning({ id: table.id });

  return rows.length;
}
