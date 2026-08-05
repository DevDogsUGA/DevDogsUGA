import {
  competitions as competitionsSpec,
  meetings as meetingsSpec,
  members as membersSpec,
  projects as projectsSpec,
  teamsTable as teamsSpec,
  workshops as workshopsSpec,
  type AirtableClient,
  type AirtableRecord,
} from "@devdogsuga/airtable";
import { AirtableNotConfiguredError, getAirtableClient } from "./credentials";
import { claimSyncLease, releaseSyncLease, type ClaimResult } from "./lease";
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
  skipped?: "already_running" | "rate_limited" | "not_configured";
  retryAfter?: number;
  durationMs: number;
  pulled: { upserted: number; archived: number; skipped: number };
  pushed: { created: number; updated: number; unchanged: number };
  gradesApplied: number;
  statusWrites: number;
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
