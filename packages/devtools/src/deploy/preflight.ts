/**
 * `pnpm devtools deploy preflight`
 *
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
 * ⚠️ **Delete this command when staging moves to a paid project.** Paid
 * projects cannot be paused, and this becomes dead code that will outlive
 * everyone who remembers why it was written.
 *
 * ## ⚠️ The exit code is the interface, and it gates a deploy job
 *
 * Exit 0 for healthy OR paused; 1 for anything else. The workflow reads
 * `paused` from `$GITHUB_OUTPUT` to decide whether to run the deploy, and
 * reads the exit code to decide whether the preflight itself failed — so
 * "paused" and "broken" must never collapse into one another. Only 540 skips.
 *
 * ## Everything human goes to stderr — the group rule, and doubly so here
 *
 * Like every command under `deploy/`, this one reports through `say()` rather
 * than `@clack/prompts`, which writes exclusively to stdout (see
 * `deploy/report.ts`). It has a second reason of its own: it runs in GitHub
 * Actions, which merges stdout and stderr into one log, and a command that
 * writes its verdict to one stream and its hints to the other has no
 * guaranteed ordering between them — so the reason for a failure can surface
 * above the failure.
 *
 * ## Interface
 *
 *   PROJECT_REF=… PUBLISHABLE_KEY=… pnpm devtools deploy preflight
 *
 * Writes `paused=true|false` to `$GITHUB_OUTPUT` and, when paused, a note to
 * `$GITHUB_STEP_SUMMARY`. It needs no env FILE and no credential — both
 * variables are public (§A.4) — so it runs through `cli:no-env`.
 */
import { appendFileSync } from "node:fs";
import { DeployError, say, summary } from "./report.js";

/** Enough to answer, short enough that a hung gateway is not a stuck job. */
export const TIMEOUT_MS = 15_000;

/**
 * Transport failures get a retry; HTTP statuses do not.
 *
 * The distinction is not fussiness. A status — any status — is the gateway
 * ANSWERING, and this command's whole job is to classify that answer; retrying
 * one would just ask the same question again. A rejected fetch is the absence
 * of an answer, and a DNS blip on a shared runner turning into a red staging
 * deploy is the noise §3.2 spends its whole length trying to avoid.
 */
export const TRANSPORT_ATTEMPTS = 3;

/** Supabase's own gateway code for a paused project. Not in any HTTP registry. */
export const PAUSED_STATUS = 540;

/**
 * Everything that touches the outside world, injected.
 *
 * The 540-vs-everything-else decision is the one thing here that must not rot,
 * and it is unreachable in a test that has to open a socket or find a real
 * paused project. So the fetch, the environment and the reporter are all
 * parameters, and `preflight.test.ts` drives every branch without a socket.
 *
 * The two FILE writes are deliberately not injected: `$GITHUB_OUTPUT` and
 * `$GITHUB_STEP_SUMMARY` are paths the environment already supplies, so a test
 * points them at a temp file and asserts the real bytes. A stub there would
 * assert the call and not the contract.
 */
export interface PreflightDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  /** Where the human-readable lines go. `say()` — that is, stderr — by default. */
  report?: (lines: readonly string[]) => void;
}

export interface PreflightVerdict {
  /**
   * `true` for a paused project, `false` for a healthy one. Both exit 0; the
   * workflow reads `paused` from `$GITHUB_OUTPUT` to decide whether to deploy.
   */
  paused: boolean;
}

/**
 * Classifies the project.
 *
 * Returning at all means exit 0 — healthy or paused. Anything else throws a
 * `DeployError`, which `cli.ts` renders to stderr and turns into exit 1. That
 * mapping IS the contract the deploy job gates on, so the two must not drift:
 * a refusal that returned, or a paused project that threw, would each invert a
 * deploy decision.
 *
 * @throws {DeployError} for a broken project, an unreachable one, or a
 *   missing `PROJECT_REF` / `PUBLISHABLE_KEY`.
 */
export async function runPreflight(
  deps: PreflightDeps = {},
): Promise<PreflightVerdict> {
  const { env = process.env, fetch = globalThis.fetch, report = say } = deps;

  /** A machine-readable verdict, echoed to the log so a human sees it too. */
  const output = (text: string): void => {
    const path = env.GITHUB_OUTPUT;
    if (path) appendFileSync(path, `${text}\n`);
    report([`preflight: ${text}`]);
  };

  const ref = env.PROJECT_REF;
  const key = env.PUBLISHABLE_KEY;

  if (!ref) {
    throw new DeployError("PROJECT_REF is not set — nothing to classify.", [
      "It is a per-environment GitHub VARIABLE (not a secret); see §A.4.",
    ]);
  }
  // Unauthenticated, PostgREST answers 401 and a 401 is indistinguishable from
  // the "broken" bucket. The publishable key is what makes 200 mean 200; it
  // discloses nothing, which is why this check can run before any real
  // credential is in scope.
  if (!key) {
    throw new DeployError(
      "PUBLISHABLE_KEY is not set — a healthy project would look broken.",
      [
        "Without it PostgREST answers 401, which this command cannot tell apart",
        "from a genuinely broken project. It is a GitHub VARIABLE, not a secret.",
      ],
    );
  }

  // Auth's health endpoint, NOT `/rest/v1/` — the REST root is PostgREST's
  // OpenAPI schema document, and Supabase now answers it with 401 "Secret API
  // key required" for every non-secret key, publishable and legacy anon alike
  // (observed 2026-08-20; it failed the first real staging preflight). Health
  // keeps the same verdict table: 200 only with the right publishable key,
  // 401 for a wrong one, 540 from the gateway when paused.
  const url = `https://${ref}.supabase.co/auth/v1/health`;

  let response: Response | undefined;
  let lastTransportError: unknown;
  for (let attempt = 1; attempt <= TRANSPORT_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      break;
    } catch (error) {
      lastTransportError = error;
      report([
        `preflight: attempt ${attempt}/${TRANSPORT_ATTEMPTS} did not reach ${ref}: ${String(error)}`,
      ]);
    }
  }

  if (!response) {
    throw new DeployError(
      `could not reach ${url} — ${String(lastTransportError)}`,
      [
        "This is not a verdict about the project: nothing answered at all.",
        "Re-run the job; if it keeps happening, the DNS name or the ref is wrong.",
      ],
    );
  }

  // 540 is Supabase's own code for a paused project, documented alongside their
  // other custom gateway statuses. It is not in any HTTP registry, so it is
  // written as a constant here rather than looked up.
  if (response.status === PAUSED_STATUS) {
    output("paused=true");
    const note = [
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
    ];
    summary(note, env);
    // Echoed to the log as well as the summary tab: a paused staging deploy is
    // a green job that did nothing, and the job log is where somebody looks
    // first to find out why.
    report(note);
    return { paused: true };
  }

  if (response.status === 200) {
    output("paused=false");
    report([`preflight: ${ref} is up.`]);
    return { paused: false };
  }

  throw new DeployError(
    `${url} answered ${response.status} ${response.statusText}, which is neither ` +
      "healthy (200) nor paused (540).",
    [
      "Only 540 is skippable. Everything else is a real fault and stays red:",
      "401 means the publishable key is wrong for this project, 404 means the",
      "ref is, and a 5xx means Supabase is having a bad day.",
    ],
  );
}
