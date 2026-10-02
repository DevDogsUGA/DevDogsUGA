import {
  validateClubConfig,
  type ClubConfig,
  type QuestionsConfig,
} from "@devdogsuga/events";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { db } from "~/server/db";
import {
  meetings,
  surveyAnswerRevisions,
  surveyAnswers,
  surveyQuestions,
  workshops,
} from "~/server/db/schema";
import { postAlert } from "../alerts";

/**
 * The reconcile-from-config: `@devdogsuga/events` in, `meetings` and
 * `workshops` up to date out.
 *
 *   * **Identity is the authored `configId`, never the name or slug.** A
 *     config item's id survives a title rewrite, so re-titling a meeting
 *     updates its row instead of orphaning the attendance already recorded
 *     against it.
 *
 *   * **The slug is the config's too.** A meeting's URL is authored next to
 *     it (`slug`), so the platform no longer derives one. Changing a slug in
 *     config re-addresses the meeting; a slug held by a meeting outside the
 *     config aborts the run instead.
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
 *
 * ## Survey questions
 *
 * `questions.json` is copied into `surveyQuestions` in the same transaction,
 * and each meeting's `questions` into its `surveyQuestionIds`. Unlike
 * meetings, a question no longer in config is DELETED, but only while
 * nobody has answered it: answers point at its id and are read back through
 * its definition. The one check config's CI cannot make -- it has no
 * database -- is made here instead: a question that has answers and was
 * removed, or changed `type` or `scope`, aborts the whole reconcile the same
 * way an invalid config does. Retiring it (`retired: true`) is the way to
 * stop asking one.
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

export interface ReconcileQuestionCounts {
  /** Inserted or updated, including retired ones. */
  upserted: number;
  /** Deleted: absent from config, and never answered. */
  removed: number;
}

export interface ReconcileCounts {
  meetings: ReconcileTableCounts;
  workshops: ReconcileTableCounts;
  questions: ReconcileQuestionCounts;
}

export type ReconcileResult =
  { ok: true; counts: ReconcileCounts } | { ok: false; reason: string };

function emptyCounts(): ReconcileTableCounts {
  return { upserted: 0, archived: 0, unarchived: 0 };
}

/**
 * A config slug already held by a meeting the config doesn't own (one under
 * an id the config no longer lists, or one never from config). Taking it
 * would mean silently re-addressing that meeting, so the reconcile aborts.
 */
class SlugConflict extends Error {
  constructor(readonly conflicts: string[]) {
    super("meeting slug held by a meeting outside the config");
  }
}

/**
 * A question change that would orphan answers: thrown inside the transaction
 * so nothing commits, then reported like any other abort.
 */
class QuestionConflict extends Error {
  constructor(readonly conflicts: string[]) {
    super("survey question change conflicts with recorded answers");
  }
}

export async function reconcileFromConfig(
  database: typeof db,
  config: ClubConfig,
  /** Omitted, the survey's questions are left exactly as they are. */
  questions?: QuestionsConfig,
): Promise<ReconcileResult> {
  const issues = validateClubConfig(config, questions);
  if (issues.length > 0) {
    const reason = `@devdogsuga/events failed runtime validation (${issues.length} issue${issues.length === 1 ? "" : "s"})`;
    await postAlert(
      "Config reconcile aborted: invalid config",
      issues.map((issue) => `[${issue.id}] ${issue.code}: ${issue.message}`),
      "This is the SAME validator `@devdogsuga/events`'s CI check runs, " +
        "so a config that reaches here failing it means CI was bypassed or " +
        "the config was built some other way. Nothing was written -- " +
        "meetings and workshops are unchanged.",
    );
    return { ok: false, reason };
  }

  if (config.meetings.length === 0) {
    const reason = "@devdogsuga/events has zero meetings";
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
    questions: { upserted: 0, removed: 0 },
  };

  try {
    await database.transaction(async (tx) => {
      // ── Survey questions ───────────────────────────────────────────────────
      // First, so a meeting's `surveyQuestionIds` never names a question this
      // run is about to refuse.
      if (questions) counts.questions = await reconcileQuestions(tx, questions);

      // ── Meetings ───────────────────────────────────────────────────────────
      const existingMeetings = await tx
        .select({
          id: meetings.id,
          configId: meetings.configId,
          slug: meetings.slug,
          deletedAt: meetings.deletedAt,
        })
        .from(meetings)
        .where(sql`${meetings.configId} is not null`);
      const meetingByConfigId = new Map(
        existingMeetings.map((m) => [m.configId!, m]),
      );

      // Slugs are authored in config (its validator keeps them unique and on
      // the meeting's own date), and `meetings_slug_key` holds across every
      // row, archived ones included. So: refuse a slug some meeting outside
      // the config already holds, then park every slug that is about to
      // change on a placeholder, so two meetings can trade slugs in one run.
      const configIds = new Set(config.meetings.map((m) => m.id));
      const wantedSlugs = config.meetings.map((m) => m.slug);
      const conflicts = (
        await tx
          .select({ slug: meetings.slug, configId: meetings.configId })
          .from(meetings)
          .where(inArray(meetings.slug, wantedSlugs))
      ).filter((m) => m.configId === null || !configIds.has(m.configId));
      if (conflicts.length > 0) {
        throw new SlugConflict(
          conflicts.map(
            (m) =>
              `"${m.slug}" belongs to ${m.configId ? `meeting "${m.configId}", which the config no longer lists` : "a meeting not from config"}`,
          ),
        );
      }
      for (const meeting of config.meetings) {
        const existing = meetingByConfigId.get(meeting.id);
        if (existing && existing.slug !== meeting.slug) {
          await tx
            .update(meetings)
            .set({ slug: `reconcile-${existing.id}` })
            .where(eq(meetings.id, existing.id));
        }
      }

      // Meeting configId → its platform uuid, so the workshop pass below can
      // resolve `meetingId` without a second round trip per meeting.
      const meetingIdByConfigId = new Map<string, string>();

      for (const meeting of config.meetings) {
        const values = {
          slug: meeting.slug,
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
          surveyQuestionIds: meeting.questions ?? [],
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

        const [inserted] = await tx
          .insert(meetings)
          .values({ ...values, configId: meeting.id })
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
  } catch (error) {
    if (error instanceof SlugConflict) {
      await postAlert(
        "Config reconcile aborted: a meeting slug is taken",
        error.conflicts,
        "These slugs are held by meetings the config no longer owns, and " +
          "taking them would re-address those meetings. Pick a different " +
          "descriptor in meetings.json, or rename the old meeting's slug in " +
          "the database first. Nothing was written.",
      );
      return {
        ok: false,
        reason: `meeting slugs held outside the config (${error.conflicts.length})`,
      };
    }
    if (!(error instanceof QuestionConflict)) throw error;
    await postAlert(
      "Config reconcile aborted: survey question change would orphan answers",
      error.conflicts,
      "Members have answered these questions, so they cannot be removed or " +
        "change type or scope. Restore them in questions.json and retire " +
        "them (`retired: true`) instead, or add a new question with a new " +
        "id. Nothing was written.",
    );
    return {
      ok: false,
      reason: `survey question changes conflict with recorded answers (${error.conflicts.length})`,
    };
  }

  return { ok: true, counts };
}

/**
 * Upserts every configured question and deletes unanswered ones config no
 * longer lists; throws `QuestionConflict` (rolling the transaction back) for
 * any change answers cannot survive. A question is answered when it has a
 * current answer or any revision -- a cleared answer still has history.
 */
async function reconcileQuestions(
  tx: Tx,
  config: QuestionsConfig,
): Promise<ReconcileQuestionCounts> {
  const existing = await tx
    .select({
      id: surveyQuestions.id,
      scope: surveyQuestions.scope,
      type: surveyQuestions.type,
      retiredAt: surveyQuestions.retiredAt,
    })
    .from(surveyQuestions);
  const existingIds = existing.map((q) => q.id);
  const answered = new Set<string>(
    existingIds.length === 0
      ? []
      : [
          ...(
            await tx
              .selectDistinct({ id: surveyAnswers.questionId })
              .from(surveyAnswers)
              .where(inArray(surveyAnswers.questionId, existingIds))
          ).map((r) => r.id),
          ...(
            await tx
              .selectDistinct({ id: surveyAnswerRevisions.questionId })
              .from(surveyAnswerRevisions)
              .where(inArray(surveyAnswerRevisions.questionId, existingIds))
          ).map((r) => r.id),
        ],
  );

  const configured = new Map(config.questions.map((q) => [q.id, q]));
  const conflicts: string[] = [];
  for (const row of existing) {
    if (!answered.has(row.id)) continue;
    const question = configured.get(row.id);
    if (!question) {
      conflicts.push(`[${row.id}] removed from questions.json, but answered`);
    } else if (question.type !== row.type || question.scope !== row.scope) {
      conflicts.push(
        `[${row.id}] changed from ${row.scope} ${row.type} to ` +
          `${question.scope} ${question.type}, but answered`,
      );
    }
  }
  if (conflicts.length > 0) throw new QuestionConflict(conflicts);

  const byId = new Map(existing.map((q) => [q.id, q]));
  for (const question of config.questions) {
    const values = {
      scope: question.scope,
      type: question.type,
      definition: question,
      // Kept from the first run that saw it retired, so it says when.
      retiredAt: question.retired
        ? (byId.get(question.id)?.retiredAt ?? new Date())
        : null,
      updatedAt: new Date(),
    };
    await tx
      .insert(surveyQuestions)
      .values({ id: question.id, ...values })
      .onConflictDoUpdate({ target: surveyQuestions.id, set: values });
  }

  const gone = existingIds.filter((id) => !configured.has(id));
  if (gone.length > 0) {
    await tx.delete(surveyQuestions).where(inArray(surveyQuestions.id, gone));
  }
  return { upserted: config.questions.length, removed: gone.length };
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
