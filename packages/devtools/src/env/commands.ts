/**
 * `pnpm devtools secrets <pull|push|audit> --env <env>`
 *
 * One local `.env`, three remote stores, and a source of truth:
 *
 *   pull   Bitwarden → your .env
 *   push   your .env → Bitwarden → GitHub environment secrets   (both, always)
 *   audit  compare .env · Bitwarden · GitHub · Cloudflare
 *
 * Three rules shape all of it:
 *
 *   * **Nothing is overwritten or removed without being asked.** Every
 *     destructive change is listed in fingerprints and confirmed. `push` sends
 *     to Bitwarden AND GitHub because a value in one and not the other is the
 *     failure this design has.
 *   * **Nothing is deleted from `.env`.** A key that should go away is
 *     commented out, so the previous value stays recoverable from the file.
 *   * **Values are never printed.** Fingerprints tell a rotation from a paste
 *     error and cannot be used to reconstruct anything.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { confirm, log, note } from "@clack/prompts";
import {
  createSecret,
  listSecrets as listBwsSecrets,
  byKey,
  projectIdFor,
  updateSecret,
} from "../bws/client.js";
import {
  ENVIRONMENT_SPECS,
  NEVER_SECRET_KEYS,
  APPLY_ONLY_KEYS,
  type BwsEnvironment,
} from "../bws/environments.js";
import { fingerprint } from "../bws/envfile.js";
import { listSecrets as listGhSecrets, setSecret } from "../gh/client.js";
import { GITHUB_ENVIRONMENT_SPECS } from "../gh/environments.js";
import { audit, hasErrors, renderFindings } from "./audit.js";
import { listWorkerSecrets } from "./cloudflare.js";
import { EnvDocument } from "./document.js";
import { PROJECT_ROOT } from "../instance.js";
import { bail, explain, unwrap } from "../ui.js";

export interface SecretsOptions {
  environment: BwsEnvironment;
  /** Defaults to the root `.env`. */
  file?: string;
  yes?: boolean;
}

/** Keys that live outside Bitwarden and must not be reported as drift. */
function ignored(): Set<string> {
  return new Set<string>([...NEVER_SECRET_KEYS, ...APPLY_ONLY_KEYS]);
}

async function readDocument(path: string): Promise<EnvDocument> {
  try {
    return EnvDocument.parse(await readFile(path, "utf8"));
  } catch {
    return EnvDocument.empty();
  }
}

function pathFor(options: SecretsOptions): string {
  return resolve(PROJECT_ROOT, options.file ?? ".env");
}

// ── pull ─────────────────────────────────────────────────────────────────────

/**
 * Brings Bitwarden's values into the local `.env`, in place.
 *
 * ⚠️ This is the file `pnpm dev` reads. Pulling `production` points local
 * development at production, which is why that environment is confirmed
 * separately and by name rather than with a generic yes/no.
 */
export async function runSecretsPull(options: SecretsOptions): Promise<void> {
  const spec = ENVIRONMENT_SPECS[options.environment];
  const path = pathFor(options);

  const projectId = await projectIdFor(spec.project);
  const remote = new Map(
    (await listBwsSecrets(projectId)).map((s) => [s.key, s.value]),
  );

  if (remote.size === 0) {
    log.warn(
      `${spec.project} contains no secrets. Writing nothing, because an empty ` +
        `result and a successful pull look identical afterwards.`,
    );
    return;
  }

  const doc = await readDocument(path);
  const changes: string[] = [];

  for (const [key, value] of remote) {
    const current = doc.get(key);
    if (current === value) continue;
    changes.push(
      current === undefined
        ? `+ ${key}  (${fingerprint(value)})${doc.isCommented(key) ? " — uncommenting" : ""}`
        : `~ ${key}  ${fingerprint(current)} → ${fingerprint(value)}`,
    );
  }

  if (changes.length === 0) {
    log.success(`${path} already matches ${spec.project}.`);
    return;
  }

  note(changes.join("\n"), `${path} would change`);

  if (spec.guarded) {
    log.warn(
      `This writes PRODUCTION values into ${path}, which is the file ` +
        `\`pnpm dev\` reads. Your local app will be pointed at production.`,
    );
  }
  if (!options.yes) {
    const ok = unwrap(
      await confirm({
        message: `Apply ${changes.length} change(s) to ${path}?`,
        initialValue: !spec.guarded,
      }),
    );
    if (!ok) bail("Nothing written.");
  }

  for (const [key, value] of remote) doc.set(key, value);
  await writeFile(path, doc.toString());

  log.success(`Updated ${changes.length} value(s) in ${path}.`);
}

// ── push ─────────────────────────────────────────────────────────────────────

/**
 * Sends the local `.env` to Bitwarden and then on to GitHub.
 *
 * Both, always. Bitwarden alone is the failure this design has: the source of
 * truth moves, the deploy does not, and everything looks healthy until the old
 * credential is revoked.
 */
export async function runSecretsPush(options: SecretsOptions): Promise<void> {
  const spec = ENVIRONMENT_SPECS[options.environment];
  const path = pathFor(options);
  const doc = await readDocument(path);
  const skip = ignored();

  const local = new Map(
    doc.entries().filter(([key, value]) => !skip.has(key) && value !== ""),
  );

  if (local.size === 0) {
    explain(`No pushable values in ${path}.`, "", [
      "Non-secrets and empty values are skipped; apply-only credentials go to",
      "production-apply separately. Nothing else was found.",
    ]);
    process.exitCode = 1;
    return;
  }

  const projectId = await projectIdFor(spec.project);
  const existing = await listBwsSecrets(projectId);
  const index = byKey(existing);

  const created: string[] = [];
  const updated: string[] = [];
  for (const [key, value] of local) {
    const current = index.get(key);
    if (!current) created.push(key);
    else if (current.value !== value) updated.push(key);
  }
  // Present in the project and absent from the file. NEVER removed — reported,
  // because a key missing from a file is far more often an incomplete edit than
  // an intentional deletion.
  const orphaned = existing
    .map((s) => s.key)
    .filter((k) => !local.has(k) && !skip.has(k));

  if (created.length === 0 && updated.length === 0) {
    log.success(`${spec.project} already matches ${path}.`);
    if (orphaned.length > 0) {
      log.warn(
        `${orphaned.length} secret(s) exist in the project and not in ${path}: ` +
          `${orphaned.join(", ")}. They were left alone.`,
      );
    }
  } else {
    note(
      [
        ...created.map((k) => `+ ${k}  (${fingerprint(local.get(k)!)})`),
        ...updated.map(
          (k) =>
            `~ ${k}  ${fingerprint(index.get(k)!.value)} → ${fingerprint(local.get(k)!)}`,
        ),
        ...orphaned.map((k) => `? ${k}  only in the project — left alone`),
      ].join("\n"),
      `${spec.project} will change`,
    );

    // Overwrites are the destructive half and get their own question, so that
    // answering yes to "create three new secrets" is not also answering yes to
    // "replace a live credential".
    if (updated.length > 0 && !options.yes) {
      const ok = unwrap(
        await confirm({
          message: `Overwrite ${updated.length} existing value(s) in ${spec.project}?`,
          initialValue: false,
        }),
      );
      if (!ok) bail("Nothing written.");
    }

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
    }

    for (const key of created) {
      await createSecret(projectId, key, local.get(key)!, MANAGED);
    }
    for (const key of updated) {
      await updateSecret(index.get(key)!.id, local.get(key)!, MANAGED);
    }
    log.success(
      `${spec.project}: ${created.length} created, ${updated.length} updated.`,
    );
  }

  await pushToGithub(options.environment, local, options.yes);
}

const MANAGED = "Managed by `pnpm devtools secrets push`.";

/** The second half of every push. Routing per GitHub environment. */
async function pushToGithub(
  environment: BwsEnvironment,
  local: Map<string, string>,
  yes?: boolean,
): Promise<void> {
  const spec = GITHUB_ENVIRONMENT_SPECS[environment];
  const chosen = new Map(
    [...local].filter(([key]) => !spec.excludeKeys.includes(key)),
  );

  const existing = await listGhSecrets(environment);
  const known = new Set(existing.map((s) => s.name));
  const fresh = [...chosen.keys()].filter((k) => !known.has(k));

  if (!yes) {
    const ok = unwrap(
      await confirm({
        message: `Sync ${chosen.size} secret(s) to the \`${environment}\` GitHub environment (${fresh.length} new)?`,
        initialValue: true,
      }),
    );
    if (!ok) {
      log.warn(
        "Skipped. ⚠️ Bitwarden is now ahead of GitHub — the deploy still uses " +
          "the previous values. Run `pnpm devtools secrets audit` when you fix it.",
      );
      return;
    }
  }

  for (const [key, value] of chosen) await setSecret(environment, key, value);
  log.success(`Synced ${chosen.size} secret(s) to \`${environment}\`.`);
}

// ── audit ────────────────────────────────────────────────────────────────────

/** Read-only, and safe to run against anything. */
export async function runSecretsAudit(options: SecretsOptions): Promise<void> {
  const spec = ENVIRONMENT_SPECS[options.environment];
  const path = pathFor(options);
  const doc = await readDocument(path);

  const projectId = await projectIdFor(spec.project);
  const bwsSecrets = await listBwsSecrets(projectId);
  const gh = await listGhSecrets(options.environment);
  const { secrets: cloudflare, unreadable } = await listWorkerSecrets(
    options.environment,
  );

  const commented = new Set(
    bwsSecrets.map((s) => s.key).filter((k) => doc.isCommented(k)),
  );

  const findings = audit({
    local: new Map(doc.entries()),
    localCommented: commented,
    bws: new Map(bwsSecrets.map((s) => [s.key, s.value])),
    github: new Set(gh.map((s) => s.name)),
    cloudflare,
    ignore: ignored(),
  });

  note(renderFindings(findings), `${options.environment} — drift`);

  if (unreadable.length > 0) {
    log.warn(
      `Could not read Worker secrets for: ${unreadable.join(", ")}. ` +
        `Usually means the Worker has not been deployed yet.`,
    );
  }

  // Said explicitly, because "no drift" reads as a stronger claim than it is.
  log.info(
    "GitHub and Cloudflare secrets are write-only, so only presence was " +
      "checked there. Values were compared between your .env and Bitwarden only.",
  );

  if (hasErrors(findings)) process.exitCode = 1;
}
