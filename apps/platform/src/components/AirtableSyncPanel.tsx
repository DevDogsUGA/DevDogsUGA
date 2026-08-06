"use client";

import { useState, useTransition } from "react";
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
      <section className="rounded-sm border-2 border-black bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            {initial === null ? (
              <p>The sync has never run.</p>
            ) : (
              <>
                <p>
                  Last run{" "}
                  <strong>
                    {/* `formatEventDateTime` rather than a bare
                        `toLocaleString`: this is a client component, so an
                        implicit zone would render one string on the server and
                        a different one after hydration. Pinning the zone makes
                        it deterministic — and it is the club's zone, which is
                        the one an officer is thinking in anyway. */}
                    {initial.lastSyncedAt
                      ? formatEventDateTime(initial.lastSyncedAt)
                      : "never"}
                  </strong>
                  {initial.lastStatus && ` — ${initial.lastStatus}`}
                </p>
                <p className="opacity-70">
                  {initial.rowsUpserted} updated · {initial.rowsRefused} refused
                  · {initial.rowsArchived} archived
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
            className="rounded-sm border-2 border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {isPending
              ? "Syncing…"
              : initial?.running
                ? "Already running"
                : "Sync now"}
          </button>
        </div>

        {initial?.lastError && (
          <p className="mt-3 rounded-sm bg-red-50 p-2 text-sm text-red-800">
            {initial.lastError}
          </p>
        )}
      </section>

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
      <p
        role="status"
        className="rounded-sm border-2 border-black bg-amber-50 p-4 text-sm"
      >
        {SKIPPED[report.skipped]}
        {report.retryAfter ? ` Try again in ${report.retryAfter}s.` : ""}
      </p>
    );
  }

  return (
    <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
      <h2 className="font-semibold">
        {report.ok ? "Sync complete" : "Sync failed"}
      </h2>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
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
      </dl>
      {report.error && (
        <p className="mt-3 rounded-sm bg-red-50 p-2 text-red-800">
          {report.error}
        </p>
      )}
      {report.refusals.length > 0 && (
        <div className="mt-4">
          <RefusalList refusals={report.refusals} />
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs tracking-wide uppercase opacity-60">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
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
      <h3 className="font-semibold">Refused ({refusals.length})</h3>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {refusals.map((refusal, index) => (
          <li key={index} className="rounded-sm bg-amber-50 p-2">
            <strong>{refusal.table}</strong> — {refusal.message}
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
  // deleted or retyped column. `pnpm airtable:verify` prints which one.
  schema_invalid:
    "The base no longer matches the registry, so the sync refused to run rather than write into nothing. Run `pnpm airtable:verify` to see which field.",
};
