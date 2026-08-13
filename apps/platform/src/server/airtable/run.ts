import {
  attendanceTable as attendanceSpec,
  competitions as competitionsSpec,
  meetings as meetingsSpec,
  members as membersSpec,
  projects as projectsSpec,
  teamsTable as teamsSpec,
  workshops as workshopsSpec,
  verifyBase,
  type AirtableClient,
  type AirtableRecord,
} from "@devdogsuga/airtable";
import { pullAttendance } from "./attendance";
import { AirtableNotConfiguredError, getAirtableClient } from "./credentials";
import {
  claimSyncLease,
  recordSchemaRefusal,
  releaseSyncLease,
  type ClaimResult,
} from "./lease";
import { postAlert } from "../discord/alerts";
import {
  pullTeamGrades,
  pushDerivedCounts,
  pushMembers,
  pushProjects,
  pushTeams,
  writeSyncStatus,
} from "./push";
import {
  projectIdMap,
  pullCompetitions,
  pullMeetings,
  pullWorkshops,
} from "./sync";
import type { Refusal } from "./refusals";

/**
 * One pass, shared verbatim by the cron and the manual trigger.
 *
 * The route handler exists only because an Airtable button field can do
 * nothing but open a URL; it must not be a second implementation, because the
 * manual path is the one an officer reaches for precisely when something has
 * already gone wrong, and a divergent code path there is a debugging trap.
 */

export interface SyncReport {
  ok: boolean;
  /** Set when the pass did not run at all. */
  skipped?:
    | "already_running"
    | "rate_limited"
    | "not_configured"
    | "schema_invalid";
  retryAfter?: number;
  /** Set with `schema_invalid`: the fatal findings, for the officer console. */
  schemaFindings?: string[];
  durationMs: number;
  pulled: { upserted: number; archived: number; skipped: number };
  pushed: { created: number; updated: number; unchanged: number };
  gradesApplied: number;
  statusWrites: number;
  /** Accounts created for MyIDs with no platform user yet. */
  accountsCreated: number;
  /** Attendance rows removed because their Airtable record was deleted. */
  attendanceRemoved: number;
  refusals: Refusal[];
  error?: string;
}

export async function runAirtableSync(
  options: {
    trigger?: "cron" | "manual";
    triggeredBy?: string | null;
    client?: AirtableClient;
  } = {},
): Promise<SyncReport> {
  const trigger = options.trigger ?? "cron";
  const started = Date.now();

  let client: AirtableClient;
  try {
    client = options.client ?? (await getAirtableClient());
  } catch (error) {
    if (error instanceof AirtableNotConfiguredError) {
      // Not an error state. The platform has to boot and run without Airtable,
      // so a base that does not exist yet is a pass that does nothing rather
      // than a cron that fails every fifteen minutes.
      return blank(started, "not_configured");
    }
    throw error;
  }

  // The base has to agree with the registry BEFORE anything is written.
  //
  // This is the check the whole verifier exists for, and it was missing: a
  // registry ID that does not exist in the base is not an error at write time.
  // Airtable accepts the request, the value lands nowhere, and the pass reports
  // success -- so a sync against a drifted base is silent data loss that looks
  // like a healthy cron. `verify.ts` being written but never called meant the
  // one failure mode it was built for was the one still unguarded.
  //
  // Costs one schema read out of roughly seven requests a pass.
  // `checkDuplicates` is off: it re-reads every record the pass is about to
  // fetch anyway, and duplicate keys are a warning rather than a reason to
  // refuse to run.
  const schema = await verifyBase(client, { checkDuplicates: false });
  if (!schema.ok) {
    const fatal = schema.findings
      .filter((f) => f.severity === "fatal")
      .map((f) => `${f.table}${f.field ? `.${f.field}` : ""}: ${f.message}`);
    console.error("[airtable] refusing to sync, base does not match registry:");
    for (const f of fatal) console.error(`  ${f}`);

    // Record it before alerting. The refusal still claims no lease and writes
    // nothing to Airtable -- this touches only the state row the console reads,
    // which until now showed the last *successful* pass with no sign that every
    // pass since had refused.
    const { previous, persisted } = await recordSchemaRefusal(fatal);

    // Only the transition is news. The cron refuses 96 times a day, and an
    // alert on every pass is one people mute -- which is worse than no alert,
    // because a muted channel still looks like coverage.
    if (persisted && previous !== "schema_invalid") {
      await postAlert(
        "Airtable sync stopped: the base no longer matches the registry",
        fatal,
        "The sync refused rather than writing into fields that no longer exist, " +
          "so nothing has been lost — but nothing is flowing either. " +
          "Run `pnpm airtable:verify` to see which field, then fix it in Airtable. " +
          "This will not be repeated until the base is fixed and drifts again.",
      );
    }

    const report = blank(started, "schema_invalid");
    report.schemaFindings = fatal;
    return report;
  }

  // The lease is claimed AFTER the client resolves so an unconfigured install
  // never touches the state row at all — otherwise `lastStatus` would read
  // "ok" on a base that has never been contacted.
  const claim: ClaimResult = await claimSyncLease(
    trigger,
    options.triggeredBy ?? null,
  );
  if (!claim.ok) {
    const report = blank(started, claim.reason);
    report.retryAfter = claim.retryAfter;
    return report;
  }

  const refusals: Refusal[] = [];
  const pulled = { upserted: 0, archived: 0, skipped: 0 };
  const pushed = { created: 0, updated: 0, unchanged: 0 };
  let gradesApplied = 0;
  let statusWrites = 0;
  let accountsCreated = 0;
  let attendanceRemoved = 0;
  let failure: unknown = null;

  try {
    // One list per table, reused by both directions. Change detection compares
    // against what Airtable currently holds rather than a stored hash, so the
    // push needs these reads anyway — sharing them is what keeps a pass at
    // roughly six requests rather than twelve.
    const listed = {
      members: await client.listRecords(membersSpec.id),
      projects: await client.listRecords(projectsSpec.id),
      meetings: await client.listRecords(meetingsSpec.id),
      workshops: await client.listRecords(workshopsSpec.id),
      competitions: await client.listRecords(competitionsSpec.id),
      teams: await client.listRecords(teamsSpec.id),
      attendance: await client.listRecords(attendanceSpec.id),
    };

    // Projects go up first: a workshop's Project link can only be resolved
    // against records that already exist in the base.
    const projectPush = await pushProjects(client, listed.projects);
    add(pushed, projectPush);

    const projectRecords =
      projectPush.created > 0
        ? await client.listRecords(projectsSpec.id)
        : listed.projects;

    // Pull order is a dependency order, not a preference: workshops resolve
    // meeting links, competitions resolve workshop links.
    const projectIds = await projectIdMap(projectRecords);

    const meetingOutcome = await pullMeetings(listed.meetings);
    addPull(pulled, meetingOutcome);
    refusals.push(...meetingOutcome.refusals);

    const workshopOutcome = await pullWorkshops(
      listed.workshops,
      meetingOutcome.idMap,
      projectIds,
    );
    addPull(pulled, workshopOutcome);
    refusals.push(...workshopOutcome.refusals);

    const competitionOutcome = await pullCompetitions(
      listed.competitions,
      workshopOutcome.idMap,
    );
    addPull(pulled, competitionOutcome);
    refusals.push(...competitionOutcome.refusals);

    // Attendance after workshops, because a response names its workshop by
    // Airtable record id and only that pass knows what those map to. Before
    // the pushes, so the ⚙️ Attendance counts a member reads in the base
    // include what this same pass just imported rather than lagging one
    // fifteen-minute cycle behind the form they watched somebody submit.
    const attendanceOutcome = await pullAttendance(
      listed.attendance,
      workshopOutcome.idMap,
    );
    pulled.upserted += attendanceOutcome.imported;
    pulled.skipped += attendanceOutcome.skipped;
    // Counted apart from `archived`. An archived meeting keeps its row and
    // stops being shown; a removed attendance row is gone, and reporting the
    // two under one label would hide the only irreversible thing a pass does.
    attendanceRemoved = attendanceOutcome.removed;
    accountsCreated = attendanceOutcome.accountsCreated;
    refusals.push(...attendanceOutcome.refusals);

    // Grades before the team push, so a team graded this pass gets its points
    // pushed in the same pass rather than fifteen minutes later.
    gradesApplied = await pullTeamGrades(listed.teams);

    add(pushed, await pushMembers(client, listed.members));
    add(pushed, await pushTeams(client, listed.teams));
    add(pushed, await pushDerivedCounts(client, listed));

    statusWrites = await writeSyncStatus(client, refusals, listed);
  } catch (error) {
    failure = error;
  }

  const ok = failure === null;
  const error = ok ? null : describe(failure);

  await releaseSyncLease({
    status: ok ? "ok" : "failed",
    error,
    rowsUpserted: pulled.upserted,
    rowsRefused: refusals.length,
    rowsArchived: pulled.archived,
    refusals,
    // Advanced only on a complete pass. A partial one must re-fetch the same
    // window rather than skip it: the records it did not reach are
    // indistinguishable from the ones it did.
    syncedAt: ok ? new Date() : null,
  });

  return {
    ok,
    durationMs: Date.now() - started,
    pulled,
    pushed,
    gradesApplied,
    statusWrites,
    accountsCreated,
    attendanceRemoved,
    refusals,
    ...(error === null ? {} : { error }),
  };
}

function blank(started: number, skipped: SyncReport["skipped"]): SyncReport {
  return {
    ok: false,
    skipped,
    durationMs: Date.now() - started,
    pulled: { upserted: 0, archived: 0, skipped: 0 },
    pushed: { created: 0, updated: 0, unchanged: 0 },
    gradesApplied: 0,
    statusWrites: 0,
    accountsCreated: 0,
    attendanceRemoved: 0,
    refusals: [],
  };
}

function add(
  into: { created: number; updated: number; unchanged: number },
  from: { created: number; updated: number; unchanged: number },
): void {
  into.created += from.created;
  into.updated += from.updated;
  into.unchanged += from.unchanged;
}

function addPull(
  into: { upserted: number; archived: number; skipped: number },
  from: { upserted: number; archived: number; skipped: number },
): void {
  into.upserted += from.upserted;
  into.archived += from.archived;
  into.skipped += from.skipped;
}

/**
 * Airtable error bodies quote the request, which can include member emails, so
 * this is deliberately lossy — `lastError` is read by the officer console.
 */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export type { AirtableRecord };
