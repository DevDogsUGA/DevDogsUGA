/**
 * Production reads and writes for `import attendance`.
 *
 * Accounts are created before {@link applyAttendance} (Auth is a separate
 * service). If the transaction then fails, they exist without profiles or
 * check-ins; rerunning the import finds them by sign-in address and records
 * them, so a rerun is the recovery.
 */
import {
  ProductionError,
  withConnection,
  type Sql,
} from "../production/access.js";
import { IMPORT_METHOD, type ExistingCheckIn } from "./plan.js";

export async function readCheckIns(
  sql: Sql,
  meetingId: string,
): Promise<ExistingCheckIn[]> {
  const rows = await sql.unsafe(
    `select "userId"::text as "userId", "method"::text as "method"
     from "platform"."attendance"
     where "meetingId" = $1::uuid
       -- A deleted member's row keeps the credit with the person nulled
       -- (account deletion). It matches no account, so it is neither a
       -- check-in to skip nor an import to remove.
       and "userId" is not null`,
    [meetingId],
  );
  return rows.map((r) => ({
    userId: String(r.userId),
    method: String(r.method),
  }));
}

/**
 * Whether production's `checkInMethod` has `import` yet. It arrives with a
 * DevDogsUGA migration; an import run before that deploy would fail on the
 * first insert with an enum error, so it is checked up front and worded.
 */
export async function requireImportMethod(sql: Sql): Promise<void> {
  const [row] = await sql.unsafe(
    `select $1 = any(enum_range(null::"platform"."checkInMethod")::text[]) as "ok"`,
    [IMPORT_METHOD],
  );
  if (row?.ok !== true) {
    throw new ProductionError(
      "Production cannot record imported check-ins yet: its checkInMethod has " +
        "no 'import' value. Deploy the DevDogsUGA migration that adds it first.",
    );
  }
}

export interface NewProfile {
  userId: string;
  email: string;
  name: string;
}

export interface AttendanceWrite {
  meetingId: string;
  /** Stamped on every imported check-in: the sheet says who came, not when. */
  recordedAt: Date;
  /** Profiles for the accounts just created. */
  profiles: NewProfile[];
  /** Everyone on the sheet with an account, created ones included. */
  userIds: string[];
  /** Remove this meeting's imported rows for anyone not in `userIds`. */
  replace: boolean;
}

export type ApplyAttendance = (
  write: AttendanceWrite,
) => Promise<{ recorded: number; removed: number }>;

export function applyAttendanceFor(url: string): ApplyAttendance {
  return (w) =>
    withConnection(url, "The import was rolled back", (sql) =>
      sql.begin(async (tx) => {
        if (w.profiles.length > 0) {
          await tx.unsafe(
            `insert into "platform"."profile" ("userId", "preferredName", "ugaEmail")
             select * from unnest($1::uuid[], $2::text[], $3::text[])
             on conflict ("userId") do nothing`,
            [
              w.profiles.map((p) => p.userId),
              w.profiles.map((p) => p.name),
              w.profiles.map((p) => p.email),
            ],
          );
        }
        let removed = 0;
        if (w.replace) {
          removed = (
            await tx.unsafe(
              `delete from "platform"."attendance"
               where "meetingId" = $1::uuid
                 and "method" = $2
                 and not ("userId" = any($3::uuid[]))`,
              [w.meetingId, IMPORT_METHOD, w.userIds],
            )
          ).count;
        }
        const recorded = (
          await tx.unsafe(
            `insert into "platform"."attendance" ("meetingId", "userId", "method", "recordedAt")
             select $1::uuid, u, $2::"platform"."checkInMethod", $3::timestamptz
             from unnest($4::uuid[]) as u
             on conflict ("meetingId", "userId") do nothing`,
            [w.meetingId, IMPORT_METHOD, w.recordedAt.toISOString(), w.userIds],
          )
        ).count;
        return { recorded, removed };
      }),
    );
}
