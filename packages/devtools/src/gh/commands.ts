/**
 * `pnpm devtools gh <push|status> [github-environment]`
 *
 * The second half of the secret path. Bitwarden is the source of truth; this
 * propagates it into GitHub environment secrets, which is what deploy jobs
 * actually read.
 *
 *   pnpm devtools bws pull production   # Bitwarden → .env.production
 *   $EDITOR .env.production                   # (optional) review
 *   pnpm devtools gh push production    # → GitHub environment secrets
 *   rm .env.production
 *
 * Why route through GitHub at all, rather than having the deploy read Bitwarden
 * directly:
 *
 *   * `${{ secrets.* }}` is **masked in workflow logs automatically**. A value
 *     pulled at run time is not, unless somebody remembers `::add-mask::` for
 *     every one — and the run where they forget is the run that prints it.
 *   * The deploy stops depending on the `bws` binary and on Bitwarden being
 *     reachable. A secrets outage should not also be a deploy outage.
 *   * Nothing machine-shaped needs a Bitwarden credential, so there are no CI
 *     machine accounts to scope, rotate, or leak.
 *
 * The cost is a second copy that cannot be read back, which is what `status`
 * exists to police.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { confirm, log, note } from "@clack/prompts";
import { listSecrets as listBwsSecrets, projectIdFor } from "../bws/client.js";
import { NEVER_SECRET_KEYS } from "../bws/environments.js";
import { fingerprint, parseEnv, type EnvMap } from "../bws/envfile.js";
import { listSecrets as listGhSecrets, setSecret } from "./client.js";
import {
  GITHUB_ENVIRONMENT_SPECS,
  type GithubEnvironment,
} from "./environments.js";
import { compareSync, renderStatus, syncIsClean } from "./sync.js";
import { PROJECT_ROOT } from "../instance.js";
import { bail, explain, unwrap } from "../ui.js";

export interface GhOptions {
  environment: GithubEnvironment;
  file?: string;
  yes?: boolean;
}

/** The keys from `local` that belong in this environment, and why the rest do not. */
function select(
  local: EnvMap,
  environment: GithubEnvironment,
): { chosen: EnvMap; problems: string[] } {
  const spec = GITHUB_ENVIRONMENT_SPECS[environment];
  const problems: string[] = [];
  const chosen: EnvMap = new Map();

  for (const [key, value] of local) {
    // FIRST, before any validation. `production-apply` reads the same
    // `.env.production` as `production`, so everything outside its two keys is
    // expected to be in the file and is simply not its business — complaining
    // about a non-secret there would make the shared file unpushable to the
    // environment that needs two of its keys.
    if (spec.onlyKeys && !spec.onlyKeys.includes(key)) continue;

    if ((NEVER_SECRET_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `${key} — not a secret. Set it with \`gh variable set ${key} --env ${environment}\`, ` +
          `where it stays readable in logs and the UI on purpose.`,
      );
      continue;
    }
    if (value === "") {
      problems.push(
        `${key} — empty. An empty secret reads as "configured" to every consumer ` +
          `that checks for presence.`,
      );
      continue;
    }
    if (spec.excludeKeys.includes(key)) {
      problems.push(
        `${key} — write-capable, and \`${environment}\` deploys with no reviewer in ` +
          `front of it. Push it to production-apply instead.`,
      );
      continue;
    }
    chosen.set(key, value);
  }

  return { chosen, problems };
}

// ── push ─────────────────────────────────────────────────────────────────────

export async function runGhPush(options: GhOptions): Promise<void> {
  const spec = GITHUB_ENVIRONMENT_SPECS[options.environment];
  const path = resolve(PROJECT_ROOT, options.file ?? spec.file);

  let local: EnvMap;
  try {
    local = parseEnv(await readFile(path, "utf8"));
  } catch {
    explain(`No file at ${path}.`, "", [
      `Pull it from Bitwarden first: pnpm devtools bws pull ${spec.bwsProject ? options.environment.replace("-apply", "") : options.environment}`,
    ]);
    process.exitCode = 1;
    return;
  }

  const { chosen, problems } = select(local, options.environment);

  if (problems.length > 0) {
    explain(
      `${problems.length} value(s) in ${path} must not go to \`${options.environment}\`.`,
      problems.join("\n"),
      ["Remove them from the file, or push them where they belong."],
    );
    process.exitCode = 1;
    return;
  }

  if (chosen.size === 0) {
    explain(`Nothing in ${path} belongs in \`${options.environment}\`.`, "", [
      spec.onlyKeys
        ? `That environment takes only: ${spec.onlyKeys.join(", ")}`
        : "The file defines no secrets.",
    ]);
    process.exitCode = 1;
    return;
  }

  const existing = await listGhSecrets(options.environment);
  const known = new Set(existing.map((s) => s.name));

  note(
    [...chosen]
      .map(
        ([key, value]) =>
          `${known.has(key) ? "~" : "+"} ${key}  (${fingerprint(value)})`,
      )
      .join("\n"),
    `${chosen.size} secret(s) → ${options.environment}`,
  );

  if (spec.guarded) {
    if (options.yes) {
      explain(
        `Refusing to write \`${options.environment}\` non-interactively.`,
        "",
        ["Drop --yes and confirm at the prompt."],
      );
      process.exitCode = 1;
      return;
    }
    const sure = unwrap(
      await confirm({
        message: `This writes to ${options.environment.toUpperCase()}. Continue?`,
        initialValue: false,
      }),
    );
    if (!sure) bail("Nothing written.");
  } else if (!options.yes) {
    const ok = unwrap(
      await confirm({
        message: `Apply to \`${options.environment}\`?`,
        initialValue: true,
      }),
    );
    if (!ok) bail("Nothing written.");
  }

  // Sequential. `gh` is one process per secret, and a burst of them against the
  // same environment is a good way to meet a secondary rate limit -- which
  // would leave the set half-applied, the one outcome worse than not starting.
  let written = 0;
  for (const [key, value] of chosen) {
    await setSecret(options.environment, key, value);
    written += 1;
  }

  log.success(`Set ${written} secret(s) on \`${options.environment}\`.`);
  log.info("Verify with: pnpm devtools gh status " + options.environment);
}

// ── status ───────────────────────────────────────────────────────────────────

/** Read-only, and the only check the second copy ever gets. */
export async function runGhStatus(options: GhOptions): Promise<void> {
  const spec = GITHUB_ENVIRONMENT_SPECS[options.environment];
  const target = await listGhSecrets(options.environment);

  if (!spec.bwsProject) {
    note(
      target.map((s) => `• ${s.name}  updated ${s.updatedAt}`).join("\n") ||
        "(none)",
      `${options.environment} — ${target.length} secret(s)`,
    );
    log.warn(
      "No Bitwarden project backs this environment, so presence is all that " +
        "can be checked. Values are write-only in GitHub.",
    );
    return;
  }

  const projectId = await projectIdFor(spec.bwsProject);
  const source = await listBwsSecrets(projectId);

  // For production-apply the project is shared, so everything outside its two
  // keys belongs to `production` and is not a gap here.
  const ignore = spec.onlyKeys
    ? source.map((s) => s.key).filter((k) => !spec.onlyKeys!.includes(k))
    : [...spec.excludeKeys];

  const status = compareSync(source, target, ignore);

  if (syncIsClean(status)) {
    log.success(
      `\`${options.environment}\` is up to date with ${spec.bwsProject} ` +
        `(${status.current.length} secret(s)).`,
    );
    return;
  }

  note(
    renderStatus(status, options.environment),
    `${spec.bwsProject} → ${options.environment}`,
  );

  if (status.stale.length > 0) {
    log.warn(
      `${status.stale.length} secret(s) were rotated in Bitwarden and never pushed. ` +
        `Whatever reads them is still using the previous value.`,
    );
  }

  process.exitCode = 1;
}
