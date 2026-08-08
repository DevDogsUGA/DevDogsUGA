import {
  applyPull,
  attendanceTable as attendanceSpec,
  type AirtableRecord,
} from "@devdogsuga/airtable";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { db } from "~/server/db";
import { attendance, profiles, workshops } from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";
import { usersInAuth } from "~/supabase/drizzle/schema";
import { checkAttendance, myIdToEmail, type Refusal } from "./refusals";

/**
 * Attendance, imported from Airtable.
 *
 * Workshops are run with a form — attendance collected alongside the poll
 * questions asked in the room anyway — and co-branded events arrive as a paste
 * from whichever club ran their own scheme. This is the only table in the sync
 * where Airtable CREATES rows; everything else is either platform-owned and
 * pushed, or officer-authored and pulled field by field.
 *
 * Postgres stays what the platform reads. `memberStars` is a view over
 * `attendance` and `judgingPass` decides team eligibility from it, and neither
 * can wait on a vendor or on a fifteen-minute sync. So this mirrors rather than
 * moves.
 */

const UGA_DOMAIN = "@uga.edu";

interface AttendanceValues {
  myId: string | null;
  workshop: string | null;
  source: string | null;
}

export interface AttendanceOutcome {
  imported: number;
  skipped: number;
  /** Rows whose Airtable record has gone. See `removeDeleted`. */
  removed: number;
  accountsCreated: number;
  refusals: Refusal[];
  /** Airtable record id → attendance uuid, for the id written back. */
  idMap: Map<string, string>;
}

/**
 * The platform account for an address, creating one if it does not exist.
 *
 * ## `email_confirm: false` is load-bearing
 *
 * A MyID off a form is unverified — nobody has checked that the person filling
 * it in owns that mailbox. Creating the user unconfirmed is what makes a wrong
 * one harmless:
 *
 * > **Measured** against the local stack: `admin.createUser` with
 * > `email_confirm: false` produces a user carrying an `email` identity with
 * > `email_verified: false`. Supabase's documented linking safeguard is that
 * > "when a new identity can be linked to an existing user, Supabase Auth will
 * > remove any other unconfirmed identities linked to an existing user" — so a
 * > later Google sign-in as that address links to this row and displaces the
 * > unconfirmed identity.
 *
 * Passing `true` would confirm the identity, the safeguard would not fire, and
 * the behaviour would depend on a case Supabase's documentation does not cover.
 * `verification.ts` does pass `true`, correctly: the Involvement CSV is UGA's
 * own roster, and a self-declared form field is not.
 *
 * ## What is deliberately NOT written
 *
 * No `ugaEmail`, no `legalFirstName`/`legalLastName`. Those are durable
 * identity from the roster and `profile_ugaEmail_key` is unique — a mistyped
 * MyID sitting in that column would raise a unique violation the next time the
 * roster import reached the real owner of the address, inside a transaction,
 * aborting the import for the entire club. One typo, everybody's import.
 */
async function resolveUser(
  email: string,
): Promise<{ userId: string; created: boolean } | null> {
  const [existing] = await db
    .select({ id: usersInAuth.id })
    .from(usersInAuth)
    .where(eq(usersInAuth.email, email))
    .limit(1);

  if (existing) return { userId: existing.id, created: false };

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: false,
  });

  if (error ?? !data.user) {
    console.error(
      `[airtable] could not create an account for ${email}:`,
      error,
    );
    return null;
  }

  // A profile so the account is complete the moment somebody signs in.
  // `preferredName` is the MyID because it is the only name we have; the
  // Google display name replaces it on first sign-in.
  await db
    .insert(profiles)
    .values({
      userId: data.user.id,
      preferredName: email.slice(0, -UGA_DOMAIN.length),
    })
    .onConflictDoNothing();

  return { userId: data.user.id, created: true };
}

/**
 * Import one pass of attendance records.
 *
 * Runs after `pullWorkshops`, because a response names a workshop by Airtable
 * record id and only that pass knows what those map to.
 */
export async function pullAttendance(
  records: AirtableRecord[],
  workshopIds: Map<string, string>,
): Promise<AttendanceOutcome> {
  const out: AttendanceOutcome = {
    imported: 0,
    skipped: 0,
    removed: 0,
    accountsCreated: 0,
    refusals: [],
    idMap: new Map(),
  };

  const parsed = applyPull<AttendanceValues>(attendanceSpec, records);

  // Before the imports, so a record deleted and a record re-created in the same
  // pass resolve in that order rather than fighting over the meeting/member key.
  out.removed = await removeDeleted(records.map((r) => r.id));

  if (parsed.length === 0) return out;

  // Every workshop's meeting, in one read. `attendance` is keyed on the
  // MEETING -- the workshop is a dimension on that row -- so the meeting has to
  // be derived rather than asked for. A form collecting both could disagree
  // with itself, and the composite foreign key would then reject the row.
  const workshopRows = await db
    .select({ id: workshops.id, meetingId: workshops.meetingId })
    .from(workshops);
  const meetingOf = new Map(workshopRows.map((w) => [w.id, w.meetingId]));

  // Rows this pass has already claimed, so two responses naming two workshops
  // of ONE meeting do not fight over the same attendance row.
  const claimed = new Set<string>();

  for (const record of parsed) {
    const email = myIdToEmail(record.values.myId);
    const workshopId = record.values.workshop
      ? (workshopIds.get(record.values.workshop) ?? null)
      : null;
    const meetingId = workshopId ? (meetingOf.get(workshopId) ?? null) : null;

    // Incomplete rather than wrong. A form response mid-submission, or a
    // workshop whose own record was incomplete this pass, will be complete
    // next time -- writing a complaint into it would be noise.
    if (record.values.myId === null || record.values.workshop === null) {
      out.skipped += 1;
      continue;
    }

    const rules = checkAttendance({
      airtableRecordId: record.airtableRecordId,
      rawMyId: record.values.myId,
      email,
      workshopId,
      meetingId,
    });
    if (rules.refusals.length > 0) {
      out.refusals.push(...rules.refusals);
      continue;
    }

    const resolved = await resolveUser(email!);
    if (!resolved) {
      out.skipped += 1;
      continue;
    }
    if (resolved.created) out.accountsCreated += 1;

    const key = `${meetingId!}:${resolved.userId}`;
    if (claimed.has(key)) {
      // A member who sat in two workshops of one meeting. The schema collapses
      // that to one row on purpose -- "attended twice" is unrepresentable --
      // so this is a legitimate submission the platform cannot store, which
      // makes it exactly a refusal rather than a skip or an error.
      out.refusals.push({
        table: "attendance",
        airtableRecordId: record.airtableRecordId,
        code: "attendance_meeting_already_recorded",
        message:
          "Already recorded for this meeting. The platform stores one " +
          "attendance per member per meeting, whichever workshop they sat in.",
      });
      continue;
    }
    claimed.add(key);

    // `onConflictDoUpdate` on the meeting/member key rather than an insert:
    // the member may already have a row from a check-in code or an officer.
    // Airtable owns the workshop dimension now, so it wins on `workshopId` --
    // but `method` and `recordedBy` are left alone, because overwriting them
    // would rewrite how an earlier row says it was captured.
    const [row] = await db
      .insert(attendance)
      .values({
        meetingId: meetingId!,
        workshopId,
        userId: resolved.userId,
        method: "airtable",
        airtableRecordId: record.airtableRecordId,
      })
      .onConflictDoUpdate({
        target: [attendance.meetingId, attendance.userId],
        set: {
          workshopId,
          airtableRecordId: record.airtableRecordId,
        },
      })
      .returning({ id: attendance.id });

    if (row) {
      out.idMap.set(record.airtableRecordId, row.id);
      out.imported += 1;
    }
  }

  return out;
}

/**
 * Attendance rows whose Airtable record has gone.
 *
 * Deleting the record IS how an officer removes somebody, and this is the step
 * that makes it so.
 *
 * ## Why this reverses the rule the rest of the pull follows
 *
 * Every other table treats a missing record as an archive rather than a delete,
 * on the grounds that attendance is a record of who was in a room on a Tuesday
 * and no amount of "I deleted the wrong row" in a spreadsheet erases that. That
 * reasoning was written when the PLATFORM created attendance and Airtable
 * mirrored it — there, a deletion in the mirror was an accident that must not
 * destroy the original.
 *
 * It inverts once Airtable is the source. The row exists only because somebody
 * created it there, so removing it there is the source saying it did not
 * happen, and a mirror that keeps asserting otherwise is simply stale.
 *
 * The safety argument inverts with it. A row deleted here is fully
 * reconstructible: restore the record from Airtable's trash and the next pass
 * re-imports it, matching on the same `airtableRecordId`. Nothing outside this
 * table references an attendance id — stars read by member and meeting, judging
 * by member and workshop — so a restored row is equivalent, not merely similar.
 * Airtable's own undo is the recovery path, which is why this needs no
 * `deletedAt` of its own.
 *
 * ## Scope
 *
 * Only rows this import created: `method = 'airtable'` with a record id. An
 * officer's correction has neither and is never touched by a pass.
 *
 * An empty `presentRecordIds` really does mean an empty table, so it really
 * does remove everything — and that is correct, because `listRecords` throws on
 * any non-2xx rather than returning a short list. A failed fetch aborts the
 * pass; it cannot masquerade as "the table is empty".
 */
async function removeDeleted(presentRecordIds: string[]): Promise<number> {
  const mine = and(
    eq(attendance.method, "airtable"),
    isNotNull(attendance.airtableRecordId),
  );

  const rows = await db
    .delete(attendance)
    .where(
      presentRecordIds.length === 0
        ? mine
        : and(mine, notInArray(attendance.airtableRecordId, presentRecordIds)),
    )
    .returning({ id: attendance.id });

  return rows.length;
}
