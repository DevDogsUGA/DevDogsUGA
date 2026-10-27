/**
 * `backstage import attendance --meeting <day> --file <sheet.csv>`: record a
 * meeting's attendance from a sign-in sheet, for the members who could not
 * check in on the platform (a dead QR code, no phone, the code rotated past).
 *
 * The sheet is a Google or Microsoft Forms response export or a hand-made
 * spreadsheet, saved as CSV; `sheet.ts` finds the email and name columns
 * (or take `--email-column`/`--name-column`). One sheet is one meeting,
 * named with `--meeting`.
 *
 * 1. read the sheet; only UGA addresses count;
 * 2. find the meeting (not cancelled, not in the future) and its check-ins;
 * 3. preview who is recorded, who needs an account, who checked in already,
 *    and with `--replace` whose earlier imported row goes; then ask;
 * 4. create the missing accounts, then one transaction writes their profiles
 *    and the check-ins (method `import`, stamped with the meeting's start).
 *
 * Rerunning the same sheet records nothing new. `--replace` makes the sheet
 * the whole set of imported check-ins for the meeting, for a corrected sheet;
 * a member's own check-in is never removed or overwritten either way.
 */
import { parseArgs } from "node:util";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { text as askText } from "@clack/prompts";
import { errorMessage, unwrap, UsageError } from "@devdogsuga/cli-core/ui";
import {
  connect,
  ProductionError,
  requireProductionKey,
} from "../production/access.js";
import {
  accountsWith,
  createAccountFor,
  createAccounts,
  type AccountRow,
  type CreateAccount,
} from "../production/accounts.js";
import {
  canPrompt,
  confirmWrite,
  plural,
  readInputFile,
  reportFailure,
  say,
} from "../production/cli.js";
import {
  describeMeeting,
  findMeetingsWith,
  pickMeeting,
  type Meeting,
} from "../production/meetings.js";
import {
  planAttendance,
  type AttendancePlan,
  type ExistingCheckIn,
} from "./plan.js";
import { parseSheet, type ParsedSheet } from "./sheet.js";
import {
  applyAttendanceFor,
  readCheckIns,
  requireImportMethod,
  type ApplyAttendance,
  type NewProfile,
} from "./store.js";

/** Production, as the import reads it. */
export interface AttendanceSource {
  findMeetings: (named: string) => Promise<Meeting[]>;
  checkIns: (meetingId: string) => Promise<ExistingCheckIn[]>;
  accounts: () => Promise<AccountRow[]>;
  /** Throws when production has no `import` check-in method yet. */
  requireImportMethod: () => Promise<void>;
  close: () => Promise<void>;
}

/** Seams for tests. Everything defaults to production. */
export interface AttendanceDeps {
  readFile?: (path: string) => Promise<string>;
  source?: () => Promise<AttendanceSource>;
  createAccount?: CreateAccount;
  apply?: ApplyAttendance;
  interactive?: boolean;
  now?: () => Date;
}

interface Values {
  meeting?: string;
  file?: string;
  "email-column"?: string;
  "name-column"?: string;
  replace?: boolean;
  yes?: boolean;
  "dry-run"?: boolean;
}

function parse(argv: readonly string[]): Values {
  try {
    return parseArgs({
      args: [...argv],
      options: {
        meeting: { type: "string" },
        file: { type: "string" },
        "email-column": { type: "string" },
        "name-column": { type: "string" },
        replace: { type: "boolean" },
        yes: { type: "boolean" },
        "dry-run": { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    }).values;
  } catch (err) {
    throw new UsageError(errorMessage(err));
  }
}

async function productionSource(): Promise<AttendanceSource> {
  const sql = connect(await requireProductionKey("DB_URL"));
  return {
    findMeetings: findMeetingsWith(sql),
    checkIns: (id) => readCheckIns(sql, id),
    accounts: () => accountsWith(sql),
    requireImportMethod: () => requireImportMethod(sql),
    close: () => sql.end({ timeout: 5 }),
  };
}

const who = (a: { email: string; name: string | null }) =>
  a.name ? `${a.name} <${a.email}>` : a.email;

export function describePlan(
  meeting: Meeting,
  sheet: ParsedSheet,
  plan: AttendancePlan,
  replace: boolean,
): string {
  const lines = [
    `Meeting: ${describeMeeting(meeting)}${meeting.hasWorkshop ? "" : " (no workshop, so it does not count for credit)"}`,
    sheet.emailColumn
      ? `Sheet: ${plural(sheet.attendees.length, "UGA address", "UGA addresses")} from "${sheet.emailColumn}"` +
        (sheet.nameColumn
          ? `, names from "${sheet.nameColumn}"`
          : ", no name column")
      : `Sheet: no header; ${plural(sheet.attendees.length, "UGA address", "UGA addresses")} found in its cells`,
    `  ${plan.record.length} to record (have an account)`,
    `  ${plan.create.length} to create an account for, then record`,
    `  ${plan.checkedIn.length} checked in themselves (left as is)`,
    `  ${plan.imported.length} imported before (left as is)`,
  ];
  if (replace) {
    lines.push(
      `  ${plan.remove.length} imported before but not on this sheet, to remove`,
    );
  }
  const section = (title: string, items: string[]) => {
    if (items.length > 0) lines.push("", title, ...items.map((i) => `  ${i}`));
  };
  section(
    "To record:",
    plan.record.map((m) => who(m.attendee)),
  );
  section("New accounts:", plan.create.map(who));
  section(
    "To remove:",
    plan.remove.map((r) => r.name),
  );
  section(
    "Skipped, no account and no name on the sheet to create one with:",
    plan.cannotCreate.map((a) => `${a.email} (line ${a.line})`),
  );
  section(
    "Skipped, not a UGA address:",
    sheet.notUga.map((n) => `${n.email} (line ${n.line})`),
  );
  if (sheet.missingEmail.length > 0) {
    section("Skipped, no address:", [`lines ${sheet.missingEmail.join(", ")}`]);
  }
  return lines.join("\n");
}

export async function runAttendance(
  argv: readonly string[],
  deps: AttendanceDeps = {},
): Promise<void> {
  const interactive = deps.interactive ?? canPrompt();
  let source: AttendanceSource | undefined;
  try {
    const values = parse(argv);
    const dryRun = values["dry-run"] === true || isDryRun();
    const replace = values.replace === true;

    let named = values.meeting;
    if (!named) {
      if (!interactive) {
        throw new UsageError(
          "Name the meeting with --meeting <day|slug>, e.g. --meeting 2026-09-09.",
        );
      }
      named = unwrap(
        await askText({
          message: "Which meeting? Its day or slug",
          placeholder: "2026-09-09",
          validate: (v) => (v?.trim() ? undefined : "A day or slug, please."),
        }),
      ).trim();
    }

    const sheet = parseSheet(
      await readInputFile(values.file, {
        interactive,
        message: "Path to the sign-in sheet (CSV)",
        placeholder: "sign-in.csv",
        read: deps.readFile,
      }),
      {
        emailColumn: values["email-column"],
        nameColumn: values["name-column"],
      },
    );
    if (sheet.attendees.length === 0 && !replace) {
      throw new UsageError("The sheet has no UGA addresses to record.");
    }
    if (sheet.duplicates > 0) {
      say(
        `${plural(sheet.duplicates, "repeat row")} for an address already read, ignored.`,
        "warn",
      );
    }

    source = await (deps.source ?? productionSource)();
    const meeting = pickMeeting(named, await source.findMeetings(named));
    if (meeting.cancelledAt) {
      throw new UsageError(`${describeMeeting(meeting)} was cancelled.`);
    }
    const now = (deps.now ?? (() => new Date()))();
    if (meeting.startsAt > now) {
      throw new UsageError(`${describeMeeting(meeting)} has not started yet.`);
    }

    const [checkIns, accounts] = await Promise.all([
      source.checkIns(meeting.id),
      source.accounts(),
    ]);
    const plan = planAttendance(sheet.attendees, accounts, checkIns, replace);
    process.stderr.write(`${describePlan(meeting, sheet, plan, replace)}\n`);

    if (dryRun) {
      say("Dry run: nothing written.");
      return;
    }
    if (plan.record.length + plan.create.length + plan.remove.length === 0) {
      say("Nothing to change.");
      return;
    }
    await source.requireImportMethod();

    const question =
      `Record ${plural(plan.record.length + plan.create.length, "check-in")} ` +
      `for ${meeting.slug}` +
      (plan.create.length > 0
        ? `, creating ${plural(plan.create.length, "account")}`
        : "") +
      (replace ? `, removing ${plan.remove.length}` : "") +
      "?";
    if (
      !(await confirmWrite(question, { yes: values.yes === true, interactive }))
    ) {
      say("Nothing written.");
      return;
    }

    let create = deps.createAccount;
    if (!create && plan.create.length > 0) {
      create = createAccountFor(
        await requireProductionKey("API_URL"),
        await requireProductionKey("SECRET_KEY"),
      );
    }
    const { created, failed } = create
      ? await createAccounts(
          plan.create.map((a) => a.email),
          create,
        )
      : { created: new Map<string, string>(), failed: [] };
    if (failed.length > 0) {
      say(
        `Could not create ${plural(failed.length, "account")}; rerun the import to record them:\n${failed
          .map((f) => `  ${f.email}: ${f.reason}`)
          .join("\n")}`,
        "warn",
      );
    }
    const profiles: NewProfile[] = plan.create.flatMap((a) => {
      const userId = created.get(a.email);
      return userId ? [{ userId, email: a.email, name: a.name! }] : [];
    });

    const apply =
      deps.apply ?? applyAttendanceFor(await requireProductionKey("DB_URL"));
    const { recorded, removed } = await apply({
      meetingId: meeting.id,
      recordedAt: meeting.startsAt,
      profiles,
      userIds: [...plan.record, ...plan.checkedIn, ...plan.imported]
        .map((m) => m.userId)
        .concat(profiles.map((p) => p.userId)),
      replace,
    });
    say(
      `Recorded ${plural(recorded, "check-in")} for ${meeting.slug}` +
        (profiles.length > 0
          ? ` (${plural(profiles.length, "new account")})`
          : "") +
        (replace ? `, removed ${removed}` : "") +
        ".",
      "success",
    );
    if (failed.length > 0) process.exitCode = 1;
  } catch (err) {
    reportFailure("import attendance", err, [ProductionError]);
  } finally {
    await source?.close().catch(() => undefined);
  }
}

export const handleAttendance: CommandHandler = async (rest) => {
  await runAttendance(rest);
  return process.exitCode ? null : DONE;
};
