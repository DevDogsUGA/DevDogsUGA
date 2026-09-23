import { validateClubConfig, type ClubConfig } from "@devdogsuga/club-config";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { clubDateKey } from "~/lib/eventTime";
import type { db } from "~/server/db";
import { meetings, workshops } from "~/server/db/schema";
import { postAlert } from "../alerts";

/**
 * The reconcile-from-config: `@devdogsuga/club-config` in, `meetings` and
 * `workshops` up to date out.
 *
 *   * **Identity is the authored `configId`, never the name or slug.** A
 *     config item's id survives a title rewrite, so re-titling a meeting
 *     updates its row instead of orphaning the attendance already recorded
 *     against it.
 *
 *   * **A missing config item is an archive, never a delete.** Attendance is
 *     a record of who was in a room on a Tuesday, and removing a meeting
 *     from next semester's config must not erase that Tuesday.
 *
 * ## Zero runtime refusals -- but one runtime validation
 *
 * This has no per-field refusal logic: publishing a config file already ran
 * it through `validateClubConfig` at CI, in `check.ts`, before the commit
 * that authored it could merge. There is nothing left to refuse row by row
 * at runtime.
 *
 * What runtime keeps is the ABORT. `validateClubConfig` runs again here,
 * against whatever the caller actually handed in, because "CI validated the
 * file that became this argument" is a fact about history that this function
 * cannot verify -- a future caller might construct a `ClubConfig` some other
 * way, or a bug might let an invalid file through CI. There is no per-row
 * officer-facing surface for this reconcile to write a refusal onto the way
 * an officer editing a form field has one: the only fix for a config CI
 * already approved is a new commit, so a partial reconcile would silently
 * archive or leave stale whatever this run refused to touch, with nobody
 * watching the moment it happened. Aborting the WHOLE reconcile and
 * reporting to Sentry is the conservative answer -- yesterday's schedule
 * stays live until somebody looks at the alert.
 *
 * The empty-config guard is the sharpest case of that: a config with zero
 * meetings is almost certainly a bug upstream (a bad fetch, an empty file),
 * and reconciling it verbatim would archive every meeting and workshop the
 * club has. Refused outright, before a single write.
 */

export interface ReconcileTableCounts {
  /** Inserted or updated -- a config item that is now present, whether or
   *  not it existed before. */
  upserted: number;
  /** Soft-archived: live before this run, absent from the config now. */
  archived: number;
  /** Un-archived: archived before this run, present again now. Counted
   *  separately from `upserted` because it is the one surprising direction
   *  -- a row members might have expected gone is back. */
  unarchived: number;
}

export interface ReconcileCounts {
  meetings: ReconcileTableCounts;
  workshops: ReconcileTableCounts;
}

export type ReconcileResult =
  { ok: true; counts: ReconcileCounts } | { ok: false; reason: string };

function emptyCounts(): ReconcileTableCounts {
  return { upserted: 0, archived: 0, unarchived: 0 };
}

/**
 * Slugs a meeting may not take, because a static route already answers them.
 * `directions` is reserved because `/events/directions` is a static route,
 * and a meeting slugged the same would be unreachable behind it.
 */
const RESERVED_MEETING_SLUGS = ["directions"] as const;

export async function reconcileFromConfig(
  database: typeof db,
  config: ClubConfig,
): Promise<ReconcileResult> {
  const issues = validateClubConfig(config);
  if (issues.length > 0) {
    const reason = `club-config failed runtime validation (${issues.length} issue${issues.length === 1 ? "" : "s"})`;
    await postAlert(
      "Config reconcile aborted: invalid config",
      issues.map((issue) => `[${issue.id}] ${issue.code}: ${issue.message}`),
      "This is the SAME validator `@devdogsuga/club-config`'s CI check runs, " +
        "so a config that reaches here failing it means CI was bypassed or " +
        "the config was built some other way. Nothing was written -- " +
        "meetings and workshops are unchanged.",
    );
    return { ok: false, reason };
  }

  if (config.meetings.length === 0) {
    const reason = "club-config has zero meetings";
    await postAlert(
      "Config reconcile aborted: zero meetings",
      [
        "The parsed config has no meetings at all. Reconciling it would " +
          "archive every meeting and workshop currently live.",
      ],
      "Check the config source -- this usually means a fetch came back " +
        "empty rather than that the club genuinely has no meetings.",
    );
    return { ok: false, reason };
  }

  const counts: ReconcileCounts = {
    meetings: emptyCounts(),
    workshops: emptyCounts(),
  };

  await database.transaction(async (tx) => {
    // ── Meetings ───────────────────────────────────────────────────────────
    const existingMeetings = await tx
      .select({
        id: meetings.id,
        configId: meetings.configId,
        deletedAt: meetings.deletedAt,
      })
      .from(meetings)
      .where(sql`${meetings.configId} is not null`);
    const meetingByConfigId = new Map(
      existingMeetings.map((m) => [m.configId!, m]),
    );
    const usedSlugs = new Set<string>([
      ...(await tx.select({ slug: meetings.slug }).from(meetings)).map(
        (m) => m.slug,
      ),
      ...RESERVED_MEETING_SLUGS,
    ]);

    // Meeting configId → its platform uuid, so the workshop pass below can
    // resolve `meetingId` without a second round trip per meeting.
    const meetingIdByConfigId = new Map<string, string>();

    for (const meeting of config.meetings) {
      const values = {
        nameOverride: meeting.title,
        summary: meeting.summary,
        kind: meeting.kind,
        building: meeting.building,
        location: meeting.location,
        startsAt: new Date(meeting.startsAt),
        endsAt: new Date(meeting.endsAt),
        rsvpUrl: meeting.rsvpUrl,
        cancelledAt:
          meeting.cancelledAt === null ? null : new Date(meeting.cancelledAt),
        cancellationReason: meeting.cancellationReason,
        countsForCredit: meeting.countsForCredit,
        surveyUrl: meeting.surveyUrl,
        // Un-archives unconditionally. `archiveMissing` below sets this the
        // moment a config item stops being listed, so a meeting reappearing
        // in a later config edit has to clear it here or it would stay
        // invisible everywhere despite being live again in config.
        deletedAt: null,
      };

      const existing = meetingByConfigId.get(meeting.id);
      if (existing) {
        await tx
          .update(meetings)
          .set(values)
          .where(eq(meetings.id, existing.id));
        meetingIdByConfigId.set(meeting.id, existing.id);
        if (existing.deletedAt !== null) counts.meetings.unarchived += 1;
        else counts.meetings.upserted += 1;
        continue;
      }

      // New meeting. The slug is derived once, on insert, and never
      // recomputed: it is in URLs the moment the meeting is published, and
      // regenerating it on every retitle would break every link anyone
      // shared. Derived from the DATE rather than the title because the
      // title is optional and most nights have none.
      const slug = uniqueSlug(
        clubDateKey(new Date(meeting.startsAt)),
        usedSlugs,
      );
      usedSlugs.add(slug);

      const [inserted] = await tx
        .insert(meetings)
        .values({ ...values, slug, configId: meeting.id })
        .returning({ id: meetings.id });
      meetingIdByConfigId.set(meeting.id, inserted!.id);
      counts.meetings.upserted += 1;
    }

    const presentMeetingConfigIds = config.meetings.map((m) => m.id);
    counts.meetings.archived = await archiveMissing(
      tx,
      meetings,
      presentMeetingConfigIds,
    );

    // ── Workshops ──────────────────────────────────────────────────────────
    // Global, like meetings: `configId` is unique among live workshops across
    // the WHOLE table, not merely within one meeting's agenda, mirroring the
    // validator's cross-config uniqueness check.
    const existingWorkshops = await tx
      .select({
        id: workshops.id,
        configId: workshops.configId,
        deletedAt: workshops.deletedAt,
      })
      .from(workshops)
      .where(sql`${workshops.configId} is not null`);
    const workshopByConfigId = new Map(
      existingWorkshops.map((w) => [w.configId!, w]),
    );

    const presentWorkshopConfigIds: string[] = [];

    for (const meeting of config.meetings) {
      const meetingId = meetingIdByConfigId.get(meeting.id)!;

      for (const item of meeting.agenda) {
        presentWorkshopConfigIds.push(item.id);
        const values = {
          meetingId,
          title: item.title,
          description: item.description,
          project: item.project,
          deletedAt: null,
        };

        const existing = workshopByConfigId.get(item.id);
        if (existing) {
          await tx
            .update(workshops)
            .set(values)
            .where(eq(workshops.id, existing.id));
          if (existing.deletedAt !== null) counts.workshops.unarchived += 1;
          else counts.workshops.upserted += 1;
          continue;
        }

        await tx.insert(workshops).values({ ...values, configId: item.id });
        counts.workshops.upserted += 1;
      }
    }

    counts.workshops.archived = await archiveMissing(
      tx,
      workshops,
      presentWorkshopConfigIds,
    );
  });

  return { ok: true, counts };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

type ArchivableTable = typeof meetings | typeof workshops;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Soft-archives every live row whose `configId` is set but absent from
 * `presentConfigIds`. The archive is scoped to rows that HAVE a `configId`,
 * so a row this reconcile does not own cannot be swept up by a pass that
 * never claimed it.
 */
async function archiveMissing(
  tx: Tx,
  table: ArchivableTable,
  presentConfigIds: string[],
): Promise<number> {
  const live = and(isNull(table.deletedAt), sql`${table.configId} is not null`);

  const rows = await tx
    .update(table)
    .set({ deletedAt: sql`now()` })
    .where(
      presentConfigIds.length === 0
        ? live
        : and(live, notInArray(table.configId, presentConfigIds)),
    )
    .returning({ id: table.id });

  return rows.length;
}

function uniqueSlug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "meeting";

  if (!taken.has(base)) return base;

  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
