"use client";

import { useState, useTransition } from "react";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";
import { formatEventDateTime } from "~/lib/eventTime";
import type { SyncStateSnapshot } from "~/server/airtable/lease";
import type { SyncReport } from "~/server/airtable/run";

/**
 * The manual sync trigger and the last pass's outcome.
 *
 * A manual sync is almost always somebody checking whether one specific edit
 * landed, so this reports what happened rather than saying "done" — and the
 * refusals are on the page in full, because a count of them answers the wrong
 * question.
 */
export default function AirtableSyncPanel({
  initial,
  runSync,
}: {
  initial: SyncStateSnapshot | null;
  runSync: () => Promise<SyncReport>;
}) {
  const [report, setReport] = useState<SyncReport | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <ConsoleCard.Root id="sync-status">
        <ConsoleCard.Content>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-mauve-300">
                {initial === null ? (
                  <p>The sync has never run.</p>
                ) : (
                  <>
                    <p>
                      Last run{" "}
                      <strong className="font-semibold text-white">
                        {/* `formatEventDateTime` rather than a bare
                            `toLocaleString`: this is a client component, so an
                            implicit zone would render one string on the server
                            and a different one after hydration. Pinning the
                            zone makes it deterministic — and it is the club's
                            zone, which is the one an officer is thinking in
                            anyway. */}
                        {initial.lastSyncedAt
                          ? formatEventDateTime(initial.lastSyncedAt)
                          : "never"}
                      </strong>
                      {initial.lastStatus && ` — ${initial.lastStatus}`}
                    </p>
                    <p className="text-mauve-400">
                      {initial.rowsUpserted} updated · {initial.rowsRefused}{" "}
                      refused · {initial.rowsArchived} archived
                    </p>
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={isPending || initial?.running}
                onClick={() =>
                  startTransition(async () => setReport(await runSync()))
                }
                className="rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
              >
                {isPending
                  ? "Syncing…"
                  : initial?.running
                    ? "Already running"
                    : "Sync now"}
              </button>
            </div>

            {/* Not an `alert`: this is the previous pass's failure, already on
                the page when it loads, not something the reader just did. */}
            {initial?.lastError && (
              <Callout tone="critical">{initial.lastError}</Callout>
            )}
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      {report && <ReportPanel report={report} />}

      {/* The stored refusals, shown when this session has not run a pass yet.
          Otherwise the fresh report supersedes them — showing both would leave
          an officer comparing two lists to work out which one is current. */}
      {!report && initial?.lastRefusals && initial.lastRefusals.length > 0 && (
        <RefusalList refusals={initial.lastRefusals} />
      )}
    </div>
  );
}

function ReportPanel({ report }: { report: SyncReport }) {
  if (report.skipped) {
    return (
      <Callout tone="warning" alert>
        {SKIPPED[report.skipped]}
        {report.retryAfter ? ` Try again in ${report.retryAfter}s.` : ""}
      </Callout>
    );
  }

  return (
    <ConsoleCard.Root id="sync-report">
      <ConsoleCard.Header title={report.ok ? "Sync complete" : "Sync failed"} />
      <ConsoleCard.Content>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          <Stat label="Updated from Airtable" value={report.pulled.upserted} />
          <Stat label="Archived" value={report.pulled.archived} />
          <Stat label="Skipped (incomplete)" value={report.pulled.skipped} />
          <Stat
            label="Written to Airtable"
            value={report.pushed.created + report.pushed.updated}
          />
          <Stat label="Already up to date" value={report.pushed.unchanged} />
          <Stat label="Grades applied" value={report.gradesApplied} />
          {/* Only when it happened. A standing "0" reads as a dial somebody
              could turn; a number appearing the week a workshop runs is the
              signal -- these are rows in auth.users, created from a form field
              nobody has verified. */}
          {report.accountsCreated > 0 && (
            <Stat label="Accounts created" value={report.accountsCreated} />
          )}
          {/* Shown only when it happened, like accounts created, and for a
              sharper reason: this is the one irreversible thing a pass does, so
              a standing "0" would train an officer to stop reading it. */}
          {report.attendanceRemoved > 0 && (
            <Stat label="Attendance removed" value={report.attendanceRemoved} />
          )}
        </dl>
        {report.error && (
          <Callout tone="critical" alert>
            {report.error}
          </Callout>
        )}
        {report.refusals.length > 0 && (
          <RefusalList refusals={report.refusals} />
        )}
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-mauve-400 uppercase">
        {label}
      </dt>
      <dd className="text-lg font-bold text-white tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * What the sync refused and why.
 *
 * Also written into each Airtable record's `Sync status`, which is where the
 * officer who made the edit will actually see it. This copy exists because the
 * console is where somebody debugging "why did nothing change" looks, and
 * asking them to go find the row in the base first is the wrong order.
 */
function RefusalList({
  refusals,
}: {
  refusals: { table: string; message: string }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">
        Refused ({refusals.length})
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {refusals.map((refusal, index) => (
          <li key={index}>
            <Callout tone="warning">
              <strong className="font-semibold">{refusal.table}</strong> —{" "}
              {refusal.message}
            </Callout>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SKIPPED: Record<NonNullable<SyncReport["skipped"]>, string> = {
  already_running: "A sync is already running.",
  rate_limited: "A sync just ran.",
  not_configured:
    "Airtable is not configured — set AIRTABLE_BASE_ID and store the token in Vault.",
  // Names the base as the thing to fix, not the platform. The registry is what
  // the code agrees with, so a mismatch is repaired in Airtable — usually a
  // deleted or retyped column. `pnpm devtools airtable verify` prints which one.
  schema_invalid:
    "The base no longer matches the registry, so the sync refused to run rather than write into nothing. Run `pnpm devtools airtable verify` to see which field.",
};
