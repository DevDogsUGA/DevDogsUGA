import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { canUserTriggerSync } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { runAirtableSync, type SyncReport } from "~/server/airtable/run";

/**
 * GET /airtable/sync: the manual sync trigger.
 *
 * Exists because an Airtable **button field** can do nothing but open a URL,
 * and that is the trigger that matters in practice: it puts the control where
 * the edit was just made, the same reasoning that puts refusals in
 * `Sync status` rather than in a log nobody reads.
 *
 * Shares one implementation with `requestAirtableSync()`. The manual path is
 * what an officer reaches for when something has already gone wrong, so a
 * second code path here would be a debugging trap.
 *
 * Two callers, two credentials:
 *
 *   * The 15-minute cron, with `CRON_SECRET`.
 *   * An officer, by session cookie. An Airtable button counts: it opens the
 *     URL in their signed-in browser.
 */
export async function GET(request: Request) {
  await connection();

  const cron =
    request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
  const devBypass =
    !process.env.DEPLOY_ENV || process.env.DEPLOY_ENV === "development";

  let triggeredBy: string | null = null;

  if (!cron) {
    // Deliberately not gated behind the dev bypass: an unauthenticated caller
    // should get a 401 in development too, because the Airtable button is the
    // thing being tested and its failure mode is silent otherwise.
    const callerId = await sessionOrNull();
    if (!callerId) unauthorized();
    if (!devBypass && !(await canUserTriggerSync(callerId))) unauthorized();
    triggeredBy = callerId;
  }

  const report = await runAirtableSync({
    trigger: cron ? "cron" : "manual",
    triggeredBy,
  });

  // A browser navigating here came from the Airtable button, and a raw JSON
  // body is a bad answer to "did my edit land?". The cron, curl and the
  // console get JSON.
  if (!cron && wantsHtml(request)) {
    return new NextResponse(renderReport(report), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json(report);
}

async function sessionOrNull(): Promise<string | null> {
  try {
    return await expectSession();
  } catch {
    return null;
  }
}

function wantsHtml(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("text/html");
}

/**
 * A summary page, not a redirect.
 *
 * A manual sync is almost always somebody checking whether one specific edit
 * landed, and "done" does not answer that. So the refusals are on the page in
 * full, rather than a count linking somewhere else.
 */
function renderReport(report: SyncReport): string {
  const heading = report.skipped
    ? SKIPPED_HEADINGS[report.skipped]
    : report.ok
      ? "Sync complete"
      : "Sync failed";

  const rows: [string, string][] = report.skipped
    ? [["Retry in", report.retryAfter ? `${report.retryAfter}s` : "a moment"]]
    : [
        ["Rows updated from Airtable", String(report.pulled.upserted)],
        ["Rows archived", String(report.pulled.archived)],
        ["Rows skipped (incomplete)", String(report.pulled.skipped)],
        [
          "Records written to Airtable",
          String(report.pushed.created + report.pushed.updated),
        ],
        ["Records already up to date", String(report.pushed.unchanged)],
        ["Grades applied", String(report.gradesApplied)],
        ["Accounts created", String(report.accountsCreated)],
        ["Attendance removed", String(report.attendanceRemoved)],
        ["Took", `${(report.durationMs / 1000).toFixed(1)}s`],
      ];

  const refusals = report.refusals
    .map(
      (r) =>
        `<li><strong>${escapeHtml(r.table)}</strong> — ${escapeHtml(r.message)}</li>`,
    )
    .join("");

  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.55 system-ui, sans-serif; margin: 0; padding: 2rem 1.25rem; max-width: 44rem; }
  h1 { font-size: 1.35rem; margin: 0 0 1rem; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: .35rem 0; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
  td + td { text-align: right; font-variant-numeric: tabular-nums; }
  ul { padding-left: 1.1rem; }
  li { margin-bottom: .75rem; }
  .err { white-space: pre-wrap; }
</style>
<h1>${escapeHtml(heading)}</h1>
<table>${rows
    .map(
      ([label, value]) =>
        `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>
${report.error ? `<p class="err">${escapeHtml(report.error)}</p>` : ""}
${refusals ? `<h2>Refused (${report.refusals.length})</h2><ul>${refusals}</ul>` : ""}
`;
}

const SKIPPED_HEADINGS: Record<NonNullable<SyncReport["skipped"]>, string> = {
  already_running: "A sync is already running",
  rate_limited: "Too soon — a sync just ran",
  not_configured: "Airtable is not configured",
  schema_invalid: "The base does not match the registry",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
