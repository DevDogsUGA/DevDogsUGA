// No database imports here: `cloudflare/scheduled.ts` imports this module's
// types, and the Worker entry's typecheck must not reach `~/server/db`. The
// reads and writes are in `./index.ts`.

/**
 * The daily background jobs, by their row in `platform."jobHeartbeats"`, and
 * how long each may go without a success before it counts as overdue.
 *
 * Sentry bills every active Crons monitor as a seat and the plan covers one,
 * which the fifteen-minute cron (`platform-cron-config-reconcile`) keeps. The
 * daily jobs report through it instead: each writes its row when a run
 * succeeds, and `/cron/heartbeats`, fired in that fifteen-minute slot, fails
 * while any row is older than its allowance. The failure marks the monitor's
 * check-in as an error, so a job that stopped running alerts like one that
 * crashed. A crash also raises its own Sentry issue at the time; this is what
 * catches a run that never started.
 *
 * Twenty-six hours is a day plus room for a slow run: the Bulletin sync
 * spaces ~42 upstream requests, and the scrape has taken over twenty minutes.
 *
 * The names are the monitor slugs the jobs used to check in to. A job added
 * here needs a seeded row in its migration, or the first check reports it
 * overdue before it has had a chance to run.
 */
export const JOB_HEARTBEATS = {
  // The catalog Worker's `ScrapeWorkflow` (schedule-builder's until the scrape
  // moved), at 14:05 UTC, recorded by its last step over the shared database
  // connection. The name is the old monitor slug and stays.
  "schedule-builder-scrape": { maxAgeHours: 26 },
  // The catalog Worker's `ProgramsWorkflow`, the UGA Bulletin program sync, at
  // 14:35 UTC. It ran in the platform's nightly-repair cron group (since
  // retired; its `platform-nightly-repair` row stays in the table, ignored)
  // until it moved with the scrape; migration 62 seeds this row.
  "catalog-academic-programs": { maxAgeHours: 26 },
  // The platform's own commit sync (`/cron/project-commits`, 05:10 UTC). Its
  // cycle can span several continuation runs, so it writes this row when the
  // cycle completes cleanly, not when a request returns; migration 79 seeds it.
  "platform-commit-sync": { maxAgeHours: 26 },
  // The Devpost hackathon sync (`/cron/hackathons-devpost`, 05:40 UTC). Written
  // like the commit sync's: when a cycle completes with every item stored, not
  // when a request returns. A failing feed leaves it to go overdue, which is
  // the sync's whole alarm; migration 80 seeds it.
  "platform-devpost-sync": { maxAgeHours: 26 },
} as const satisfies Record<string, { maxAgeHours: number }>;

export type HeartbeatJob = keyof typeof JOB_HEARTBEATS;

export function isHeartbeatJob(job: unknown): job is HeartbeatJob {
  return typeof job === "string" && Object.hasOwn(JOB_HEARTBEATS, job);
}

export interface OverdueJob {
  job: HeartbeatJob;
  /** `null` when the job has no row at all. */
  lastSucceededAt: string | null;
}

/**
 * The jobs in `JOB_HEARTBEATS` whose last success is older than their
 * allowance at `now`. A job with no row is overdue: the migration seeds every
 * job's row, so a missing one was deleted, and nothing would ever say so.
 * Rows for jobs not listed are ignored.
 */
export function overdueJobs(
  rows: readonly { job: string; succeededAt: Date }[],
  now: Date,
): OverdueJob[] {
  const last = new Map(rows.map((row) => [row.job, row.succeededAt]));
  const overdue: OverdueJob[] = [];
  for (const [job, { maxAgeHours }] of Object.entries(JOB_HEARTBEATS)) {
    const succeededAt = last.get(job);
    if (
      !succeededAt ||
      now.getTime() - succeededAt.getTime() > maxAgeHours * 60 * 60 * 1000
    ) {
      overdue.push({
        job: job as HeartbeatJob,
        lastSucceededAt: succeededAt?.toISOString() ?? null,
      });
    }
  }
  return overdue;
}
