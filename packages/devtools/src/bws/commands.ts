/**
 * `pnpm devtools bws <pull|push|diff> --env <staging|production>`
 *
 * Moving a `.env` file into Secrets Manager and back out again, without ever
 * printing a value.
 *
 * Three rules shape all of it:
 *
 *   * **Nothing destructive without being asked twice.** `push` never deletes;
 *     removing a key is `--prune`, and `production` is confirmed on top of that.
 *   * **Show the diff first, in fingerprints.** A key list plus "48 chars, s…9"
 *     is enough to tell a rotation from a paste error, and safe to put in a
 *     screenshot. Rendering values would defeat the whole exercise at the one
 *     moment somebody is most likely to share their terminal.
 *   * **Refuse values that do not belong.** A non-secret in BWS is a value with
 *     two sources of truth, and the loser is whichever the reader did not check.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { confirm, log, note } from "@clack/prompts";
import {
  byKey,
  createSecret,
  deleteSecrets,
  listSecrets,
  projectIdFor,
  toEnvMap,
  updateSecret,
} from "./client.js";
import {
  APPLY_ONLY_KEYS,
  ENVIRONMENT_SPECS,
  NEVER_SECRET_KEYS,
  type BwsEnvironment,
} from "./environments.js";
import {
  diffEnv,
  diffIsEmpty,
  fingerprint,
  parseEnv,
  serializeEnv,
  type EnvMap,
} from "./envfile.js";
import { PROJECT_ROOT } from "../instance.js";
import { bail, explain, unwrap } from "../ui.js";

export interface BwsOptions {
  environment: BwsEnvironment;
  /** Overrides the environment's default file. */
  file?: string;
  /** Delete secrets in the project that the file does not define. */
  prune?: boolean;
  /** Skip prompts. For CI; never skips the "is this production" gate. */
  yes?: boolean;
}

function pathFor(options: BwsOptions): string {
  return join(
    PROJECT_ROOT,
    options.file ?? ENVIRONMENT_SPECS[options.environment].file,
  );
}

/** Reads the local file, or explains what to do when it is not there. */
async function readLocal(path: string): Promise<EnvMap | null> {
  try {
    return parseEnv(await readFile(path, "utf8"));
  } catch {
    explain(`No file at ${path}.`, "", [
      "Pull the current values first:  pnpm devtools bws pull --env <env>",
      "Or point at another file:       --file .env.something",
    ]);
    return null;
  }
}

/**
 * Keys this tool refuses to push, and why.
 *
 * Returned rather than thrown so every offending key is reported at once —
 * fixing these one error per run is how somebody ends up deleting the whole
 * block in frustration.
 */
function rejections(local: EnvMap, environment: BwsEnvironment): string[] {
  const problems: string[] = [];

  for (const key of NEVER_SECRET_KEYS) {
    if (local.has(key)) {
      problems.push(
        `${key} — not a secret. It is either committed or a GitHub environment variable.`,
      );
    }
  }

  if (environment === "production") {
    for (const key of APPLY_ONLY_KEYS) {
      if (local.has(key)) {
        problems.push(
          `${key} — write-capable, and the production deploy must not be able to read it. ` +
            `It belongs on the production-apply GitHub environment, behind its required reviewers.`,
        );
      }
    }
  }

  for (const [key, value] of local) {
    if (value === "") {
      problems.push(
        `${key} — empty. Store the key with a real value or leave it out; an empty ` +
          `secret reads as "configured" to every consumer that checks for presence.`,
      );
    }
  }

  return problems;
}

// ── pull ─────────────────────────────────────────────────────────────────────

/**
 * Writes the project's secrets to a local file.
 *
 * Overwrites without asking when the content matches, and asks when it does
 * not — the common case is re-pulling to confirm nothing drifted, and a prompt
 * on every no-op run is one people learn to answer without reading.
 */
export async function runBwsPull(options: BwsOptions): Promise<void> {
  const spec = ENVIRONMENT_SPECS[options.environment];
  const path = pathFor(options);

  const projectId = await projectIdFor(spec.project);
  const remote = toEnvMap(await listSecrets(projectId));

  if (remote.size === 0) {
    log.warn(
      `${spec.project} contains no secrets. Writing an empty file would look ` +
        `like a successful pull, so nothing was written.`,
    );
    return;
  }

  let existing: EnvMap = new Map();
  try {
    existing = parseEnv(await readFile(path, "utf8"));
  } catch {
    // No local file yet. Nothing to overwrite, nothing to confirm.
  }

  const diff = diffEnv(remote, existing);
  if (existing.size > 0 && !diffIsEmpty(diff)) {
    note(renderDiff(diff, remote, existing, "file"), `${path} would change`);
    const ok = unwrap(
      await confirm({ message: `Overwrite ${path}?`, initialValue: false }),
    );
    if (!ok) bail("Nothing written.");
  }

  await writeFile(
    path,
    serializeEnv(
      remote,
      [
        `Pulled from the Bitwarden Secrets Manager project "${spec.project}".`,
        ``,
        `DO NOT COMMIT. Regenerate with:`,
        `  pnpm devtools bws pull --env ${options.environment}`,
        ``,
        `Edits here reach the environment only through:`,
        `  pnpm devtools bws push --env ${options.environment}`,
      ].join("\n"),
    ),
  );

  log.success(`Wrote ${remote.size} secret(s) to ${path}.`);
}

// ── push ─────────────────────────────────────────────────────────────────────

export async function runBwsPush(options: BwsOptions): Promise<void> {
  const spec = ENVIRONMENT_SPECS[options.environment];
  const path = pathFor(options);

  const local = await readLocal(path);
  if (!local) {
    process.exitCode = 1;
    return;
  }

  if (local.size === 0) {
    explain(`${path} defines no variables.`, "", [
      "Pushing it would be a no-op at best and a --prune of everything at worst.",
    ]);
    process.exitCode = 1;
    return;
  }

  const problems = rejections(local, options.environment);
  if (problems.length > 0) {
    explain(
      `${problems.length} value(s) in ${path} must not be pushed.`,
      problems.join("\n"),
      ["Remove them from the file, then re-run."],
    );
    process.exitCode = 1;
    return;
  }

  const projectId = await projectIdFor(spec.project);
  const existing = await listSecrets(projectId);
  const remote = toEnvMap(existing);
  const diff = diffEnv(local, remote);

  if (diffIsEmpty(diff)) {
    log.success(`${spec.project} already matches ${path}. Nothing to do.`);
    return;
  }

  note(
    renderDiff(diff, local, remote, "project"),
    `${spec.project} will change`,
  );

  if (diff.orphaned.length > 0 && !options.prune) {
    log.warn(
      `${diff.orphaned.length} secret(s) exist in the project and not in the file. ` +
        `They will be LEFT ALONE. Pass --prune to delete them.`,
    );
  }

  // The production gate is not skippable with --yes. `--yes` exists so CI can
  // run unattended, and CI has no business pushing production secrets.
  if (spec.guarded) {
    if (options.yes) {
      explain("Refusing to push production non-interactively.", "", [
        "Drop --yes and confirm at the prompt.",
      ]);
      process.exitCode = 1;
      return;
    }
    const sure = unwrap(
      await confirm({
        message: `This writes to PRODUCTION (${spec.project}). Continue?`,
        initialValue: false,
      }),
    );
    if (!sure) bail("Nothing written.");
  } else if (!options.yes) {
    const ok = unwrap(
      await confirm({
        message: `Apply to ${spec.project}?`,
        initialValue: true,
      }),
    );
    if (!ok) bail("Nothing written.");
  }

  const index = byKey(existing);
  const note_ = `Managed by \`pnpm devtools bws push --env ${options.environment}\`.`;

  for (const key of diff.added) {
    await createSecret(projectId, key, local.get(key) ?? "", note_);
  }
  for (const key of diff.changed) {
    const secret = index.get(key);
    if (secret) await updateSecret(secret.id, local.get(key) ?? "", note_);
  }

  let pruned = 0;
  if (options.prune && diff.orphaned.length > 0) {
    const ids = diff.orphaned
      .map((key) => index.get(key)?.id)
      .filter((id): id is string => id !== undefined);
    await deleteSecrets(ids);
    pruned = ids.length;
  }

  log.success(
    `${spec.project}: ${diff.added.length} created, ${diff.changed.length} updated` +
      (pruned > 0 ? `, ${pruned} deleted` : "") +
      `, ${diff.unchanged.length} unchanged.`,
  );
}

// ── diff ─────────────────────────────────────────────────────────────────────

/** Read-only. The one command that is safe to run against production. */
export async function runBwsDiff(options: BwsOptions): Promise<void> {
  const spec = ENVIRONMENT_SPECS[options.environment];
  const path = pathFor(options);

  const local = await readLocal(path);
  if (!local) {
    process.exitCode = 1;
    return;
  }

  const projectId = await projectIdFor(spec.project);
  const remote = toEnvMap(await listSecrets(projectId));
  const diff = diffEnv(local, remote);

  if (diffIsEmpty(diff)) {
    log.success(
      `${path} matches ${spec.project} (${diff.unchanged.length} keys).`,
    );
    return;
  }

  note(
    renderDiff(diff, local, remote, "project"),
    `${path} vs ${spec.project}`,
  );
  process.exitCode = 1;
}

// ── rendering ────────────────────────────────────────────────────────────────

/**
 * The diff, in fingerprints.
 *
 * `target` names what would be modified, so the same renderer reads correctly
 * for a pull (the file changes) and a push (the project changes).
 */
function renderDiff(
  diff: ReturnType<typeof diffEnv>,
  source: EnvMap,
  target: EnvMap,
  targetName: string,
): string {
  const lines: string[] = [];

  for (const key of diff.added) {
    lines.push(`+ ${key}  (${fingerprint(source.get(key) ?? "")})`);
  }
  for (const key of diff.changed) {
    lines.push(
      `~ ${key}  ${fingerprint(target.get(key) ?? "")} → ${fingerprint(source.get(key) ?? "")}`,
    );
  }
  for (const key of diff.orphaned) {
    lines.push(`? ${key}  only in the ${targetName}`);
  }
  if (diff.unchanged.length > 0) {
    lines.push(``, `${diff.unchanged.length} unchanged.`);
  }

  return lines.join("\n");
}
