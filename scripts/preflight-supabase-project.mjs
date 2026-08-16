/**
 * Classifies a Supabase project as healthy, paused, or broken — before a
 * deploy spends any credential on it.
 *
 * ## Why this exists at all (security plan §3.2)
 *
 * Staging's Supabase project is on the free tier, so it pauses after a week
 * without activity, and staging deploys land roughly weekly. **A paused
 * project is the expected state, not an exception.** Left unhandled it does
 * not announce itself either: the deploy proceeds, the migrations step opens a
 * Postgres connection, and the job dies with a connection error that reads
 * exactly like a broken migration.
 *
 * Supabase publishes a status code for precisely this case — **HTTP 540, "the
 * project the request was being made against has been paused"** — and it comes
 * from the API gateway rather than from Postgres, so one request classifies the
 * project before anything authenticates to it.
 *
 *   540        paused    skip the deploy, annotate, exit 0
 *   200        healthy   proceed
 *   anything   broken    fail loudly
 *
 * ## Skip rather than fail, and ONLY on 540
 *
 * A staging deploy runs after the merge to `main` has already landed, so
 * failing it blocks nothing — it only paints CI red. If that happens most
 * weeks then red stops meaning anything, which costs more than a stale staging
 * environment does. Every other outcome stays a hard failure, because those
 * are the ones a person has to look at.
 *
 * Resuming is a dashboard action, and deliberately so: there is no documented
 * Management API restore, and a Management API token carries full account
 * privileges across BOTH Supabase organizations (§1.3) — which is exactly what
 * the staging tier must not hold. So the skip writes the dashboard link and
 * stops there.
 *
 * > Rejected: a keep-alive cron on the staging Worker. It works — Supabase
 * > documents that a few requests a day prevent pausing — but it only holds
 * > while staging is deployed and healthy, so the first broken deploy silently
 * > starts a one-week timer to a paused project. Handling the paused state is
 * > honest about what staging is; keeping it warm hides it.
 *
 * ⚠️ **Delete this script when staging moves to a paid project.** Paid projects
 * cannot be paused, and this becomes dead code that will outlive everyone who
 * remembers why it was written.
 *
 * ## Interface
 *
 *   PROJECT_REF=… PUBLISHABLE_KEY=… node scripts/preflight-supabase-project.mjs
 *
 * Writes `paused=true|false` to `$GITHUB_OUTPUT` and, when paused, a note to
 * `$GITHUB_STEP_SUMMARY`. Exit 0 for healthy or paused, 1 for anything else.
 */
import { appendFileSync } from "node:fs";

/** Enough to answer, short enough that a hung gateway is not a stuck job. */
const TIMEOUT_MS = 15_000;

/**
 * Transport failures get a retry; HTTP statuses do not.
 *
 * The distinction is not fussiness. A status — any status — is the gateway
 * ANSWERING, and this script's whole job is to classify that answer; retrying
 * one would just ask the same question again. A rejected fetch is the absence
 * of an answer, and a DNS blip on a shared runner turning into a red staging
 * deploy is the noise §3.2 spends its whole length trying to avoid.
 */
const TRANSPORT_ATTEMPTS = 3;

function output(line) {
  const path = process.env.GITHUB_OUTPUT;
  if (path) appendFileSync(path, `${line}\n`);
  console.error(`preflight: ${line}`);
}

function summary(lines) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) appendFileSync(path, `${lines.join("\n")}\n`);
  for (const line of lines) console.error(line);
}

function refuse(message, hints = []) {
  console.error(`preflight: ${message}`);
  for (const hint of hints) console.error(`  ${hint}`);
  process.exit(1);
}

const ref = process.env.PROJECT_REF;
const key = process.env.PUBLISHABLE_KEY;

if (!ref) {
  refuse("PROJECT_REF is not set — nothing to classify.", [
    "It is a per-environment GitHub VARIABLE (not a secret); see §A.4.",
  ]);
}
// Unauthenticated, PostgREST answers 401 and a 401 is indistinguishable from
// the "broken" bucket. The publishable key is what makes 200 mean 200; it
// discloses nothing, which is why this check can run before any real
// credential is in scope.
if (!key) {
  refuse("PUBLISHABLE_KEY is not set — a healthy project would look broken.", [
    "Without it PostgREST answers 401, which this script cannot tell apart",
    "from a genuinely broken project. It is a GitHub VARIABLE, not a secret.",
  ]);
}

const url = `https://${ref}.supabase.co/rest/v1/`;

let response;
let lastTransportError;
for (let attempt = 1; attempt <= TRANSPORT_ATTEMPTS; attempt += 1) {
  try {
    response = await fetch(url, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    break;
  } catch (error) {
    lastTransportError = error;
    console.error(
      `preflight: attempt ${attempt}/${TRANSPORT_ATTEMPTS} did not reach ${ref}: ${String(error)}`,
    );
  }
}

if (!response) {
  refuse(`could not reach ${url} — ${String(lastTransportError)}`, [
    "This is not a verdict about the project: nothing answered at all.",
    "Re-run the job; if it keeps happening, the DNS name or the ref is wrong.",
  ]);
}

// 540 is Supabase's own code for a paused project, documented alongside their
// other custom gateway statuses. It is not in any HTTP registry, so it is
// written as a literal here rather than looked up.
if (response.status === 540) {
  output("paused=true");
  summary([
    "### Staging is paused — deploy skipped",
    "",
    `Supabase project \`${ref}\` answered **HTTP 540**: the project has been`,
    "paused. Free-tier projects pause after a week without activity, and",
    "staging deploys roughly weekly, so this is the expected state rather than",
    "a fault. Nothing was deployed and nothing is broken.",
    "",
    `**Resume it:** <https://supabase.com/dashboard/project/${ref}>`,
    "",
    "Resuming is a dashboard action on purpose: there is no documented",
    "Management API restore, and a Management API token would carry full",
    "account privileges across both Supabase organizations — which is exactly",
    "what the staging tier must not hold. Re-run this workflow once the",
    "project is up.",
    "",
  ]);
  process.exit(0);
}

if (response.status === 200) {
  output("paused=false");
  console.error(`preflight: ${ref} is up.`);
  process.exit(0);
}

refuse(
  `${url} answered ${response.status} ${response.statusText}, which is neither ` +
    "healthy (200) nor paused (540).",
  [
    "Only 540 is skippable. Everything else is a real fault and stays red:",
    "401 means the publishable key is wrong for this project, 404 means the",
    "ref is, and a 5xx means Supabase is having a bad day.",
  ],
);
