/**
 * Reports — and, only when asked, deletes — Worker secrets nothing declares.
 *
 * ## Why there is anything to audit
 *
 * `wrangler deploy --secrets-file` applies additively: it preserves every
 * secret it does not mention. So renaming a variable, or dropping one, leaves
 * the old secret on the Worker indefinitely, and nothing else in the system
 * can see it — Bitwarden does not know about it, GitHub does not, and the
 * app's schema stopped mentioning it. Cloudflare will happily hold a
 * credential nobody has thought about for a year.
 *
 * The expected set is derived from the app's own manifest: every key it
 * declares with `secrecy: "secret"`. That deliberately includes the MINTED
 * ones — `SANDBOX_PROXY_TOKEN` has no copy in Bitwarden or GitHub by design,
 * and an audit that reasoned from stored copies alone would report the live
 * proxy credential as safe to delete. (`secrets audit` had exactly that bug;
 * see `EnvMeta.minted`.)
 *
 * ## Report always, prune almost never (security plan §3.6)
 *
 *   report   every production deploy      environment: production
 *   prune    `workflow_dispatch` only     environment: production-apply
 *
 * **Orphans never fail the deploy.** A stale secret name is not a defect in
 * the change being deployed, and failing on it would make an unrelated commit
 * responsible for a cleanup somebody else deferred.
 *
 * **Pruning must not chain to a deploy.** Deleting a secret publishes a new
 * version of the currently deployed code with the secret gone — there is no
 * way to change a secret without publishing. Auto-pruning would therefore turn
 * every deploy carrying an orphan into TWO version publishes, and the second
 * one bypasses both the promotion PR and the `production-apply` approval that
 * the first went through. That is why this is a separate, deliberate,
 * human-triggered run.
 *
 * > **Names only.** Cloudflare never returns a secret's value, so a secret
 * > whose VALUE is wrong is undetectable here. A clean audit means "no name is
 * > unaccounted for", not "the configuration is correct".
 *
 * Recovery from a wrong prune is real but not instant: Bitwarden is the source
 * of truth and every deploy sends the complete set, so a wrongly deleted
 * secret comes back on the next deploy — with an outage in between.
 *
 * ## Interface
 *
 *   DEPLOY_ENV=production pnpm exec tsx scripts/deploy-orphan-audit.ts [--prune]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveEnvironment, variables, type EnvEntry } from "@devdogsuga/env";
import { loadRegistry } from "../packages/devtools/src/env/discovery.js";
import {
  listWorkerSecrets,
  WORKER_APPS,
} from "../packages/devtools/src/env/cloudflare.js";
import { PROJECT_ROOT } from "../packages/devtools/src/instance.js";

const prune = process.argv.includes("--prune");

function summary(lines: string[]): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) writeFileSync(path, `${lines.join("\n")}\n`, { flag: "a" });
  for (const line of lines) console.error(line);
}

const environment = resolveEnvironment(process.env.DEPLOY_ENV);
if (environment === "development") {
  console.error(
    "deploy-orphan-audit: DEPLOY_ENV must name a deployed environment.",
  );
  process.exit(1);
}

await loadRegistry();

/** Secret names the app's manifest declares, stored or minted. */
function expectedFor(app: string): Set<string> {
  const keys = new Set<string>();
  for (const [key, entries] of variables()) {
    const own = entries.filter((e: EnvEntry) => e.source === app && !e.client);
    if (own.length === 0) continue;
    if (own.some((e) => e.meta.secrecy === "secret")) keys.add(key);
  }
  return keys;
}

const { secrets, unreadable } = await listWorkerSecrets(environment);

const lines: string[] = [
  `### Worker secret audit — \`${environment}\``,
  "",
  "Names only: Cloudflare never returns a value, so this cannot see a secret",
  "that is present and wrong.",
  "",
];

let total = 0;
const toPrune: { app: string; worker: string; key: string }[] = [];

for (const app of WORKER_APPS) {
  const worker = `${environment}-${app}`;
  const found = secrets.get(worker);
  if (!found) continue;

  const expected = expectedFor(app);
  const orphans = [...found].filter((name) => !expected.has(name)).sort();
  total += orphans.length;

  lines.push(
    orphans.length === 0
      ? `* \`${worker}\` — ${found.size} secret(s), nothing unaccounted for.`
      : `* \`${worker}\` — **${orphans.length} orphaned**: ${orphans.map((o) => `\`${o}\``).join(", ")}`,
  );
  for (const key of orphans) toPrune.push({ app, worker, key });
}

if (unreadable.length > 0) {
  lines.push(
    "",
    `Could not read: ${unreadable.map((w) => `\`${w}\``).join(", ")}. A Worker`,
    "that has never been deployed is the ordinary reason, and the audit still",
    "reports everything it could see — an audit that refuses to run is an",
    "audit nobody runs.",
  );
}

if (total === 0) {
  lines.push("", "No orphaned secrets.");
  summary([...lines, ""]);
  process.exit(0);
}

if (!prune) {
  lines.push(
    "",
    "Nothing was deleted, and this does not fail the deploy — a stale name is",
    "not a defect in the change that was just shipped. To remove them, run",
    "this workflow by hand with **Prune orphaned Worker secrets** ticked; it",
    "goes through the `production-apply` reviewers, because each deletion",
    "publishes a new version of the deployed code.",
    "",
  );
  summary(lines);
  process.exit(0);
}

lines.push("", "Pruning:");
for (const { app, worker, key } of toPrune) {
  try {
    // Wrangler prompts before deleting and takes the default when stdin is not
    // a TTY, which on a runner it is not. `stdio: "inherit"` keeps its own
    // output on the job log where a reviewer approving this can read it.
    execFileSync(
      "pnpm",
      ["exec", "wrangler", "secret", "delete", key, "--env", environment],
      { cwd: join(PROJECT_ROOT, "apps", app), stdio: "inherit", shell: false },
    );
    lines.push(`* deleted \`${key}\` from \`${worker}\``);
  } catch {
    // Fatal HERE and only here: this run exists to delete these, so a failure
    // is the whole result rather than a footnote to a deploy.
    lines.push(`* **failed** to delete \`${key}\` from \`${worker}\``);
    summary([...lines, ""]);
    process.exit(1);
  }
}

summary([
  ...lines,
  "",
  "Each deletion published a new version of the code already deployed. If one",
  "of these was live rather than stale, the next deploy restores it from",
  `Bitwarden — with an outage in between.`,
  "",
]);
