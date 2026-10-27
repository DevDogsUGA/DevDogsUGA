/**
 * `backstage env <pull|push|audit> --target <target>` (plus `--prune` on audit)
 *
 *   pull   Bitwarden into your env file
 *   push   your env file to Bitwarden, then to GitHub secrets AND variables
 *   audit  compare the file, Bitwarden, GitHub and Cloudflare, and list the Worker
 *          secrets no app declares (--prune deletes them)
 *
 * ⚠️ THE FILE IS DERIVED FROM THE TARGET, and that one line was this
 * module's bug. `pathFor()` used to default to the root `.env` regardless of
 * target and honour only an explicit `--file`, while `init` mapped target to
 * file the way the table always said. So `push --env staging` uploaded the
 * DEVELOPMENT file to the staging project and reported success. Neither
 * subcommand was internally wrong; they read two different enums behind one
 * flag name. `--file` remains, as an override somebody types on purpose.
 *
 * Four rules shape all of it:
 *
 *   * **Nothing is overwritten or removed without being asked.** Every
 *     destructive change is listed in fingerprints and confirmed. `push` sends
 *     to Bitwarden AND GitHub because a value in one and not the other is the
 *     failure this design has.
 *   * **Bitwarden holds an entire target, not its secret half.** The public
 *     per-environment values (`PROJECT_REF`, `BASE_URL`, `PUBLISHABLE_KEY`,
 *     and so on) are stored there too and pushed on to GitHub as *variables*
 *     rather than secrets. Storing them as secrets would mask them by
 *     substring in every log line they appear in and make their values
 *     unreadable to `audit`; leaving them out of Bitwarden would mean `pull`
 *     reconstructs a file that cannot boot an app.
 *   * **Nothing is deleted from the file.** A key that should go away is
 *     commented out, so the previous value stays recoverable from the file.
 *   * **Values are never printed.** Fingerprints tell a rotation from a paste
 *     error and cannot be used to reconstruct anything.
 */
import { flagValue, positionals } from "@devdogsuga/cli-core/args";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import { pathFor, readDocument, save } from "@devdogsuga/cli-core/env/files";
import { fingerprint } from "@devdogsuga/cli-core/env/fingerprint";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { recordResolved } from "@devdogsuga/cli-core/invocation";
import { derivedBuildValues } from "./derived-build.js";
import { catalog } from "../catalog.js";
import {
  resolveProduct,
  resolveProductTarget,
  runProductAudit,
  runProductPull,
  runProductPush,
} from "./product.js";
import { resolveVaultTarget } from "../bws/pick.js";
import { confirm, log, note } from "@clack/prompts";
import type { EnvTarget } from "@devdogsuga/sdk/env/targets";
import { getEnvSync } from "@devdogsuga/cli-core/repo/peers";
import {
  createSecret,
  listSecrets as listBwsSecrets,
  byKey,
  projectIdFor,
  setExplicitAccessToken,
  updateSecret,
} from "../bws/client.js";
import {
  environmentSpecs,
  assertVaultTarget,
  type VaultTarget,
} from "../bws/environments.js";
import {
  listSecrets as listGhSecrets,
  listVariables as listGhVariables,
  listRepositoryVariables,
  setSecret,
  setVariable,
} from "../gh/client.js";
import {
  GITHUB_ENVIRONMENT_SPECS,
  accepts,
  acceptedBy,
  acceptsKey,
  githubTargets,
  routeTo,
  type GithubEnvironment,
} from "../gh/environments.js";
import {
  audit,
  hasErrors,
  renderFindings,
  type GithubEntry,
  type GithubVariableEntry,
  type RepositoryVariableScan,
} from "./audit.js";
import { listWorkerSecrets } from "./cloudflare.js";
import {
  deleteOrphanViaWrangler,
  findOrphans,
  pruneOrphans,
} from "./orphans.js";
import { requireCloudflareToken } from "../deploy/token.js";
import { isNoEnv, isNonInteractive } from "@devdogsuga/cli-core/mode";
import type { Stamp } from "@devdogsuga/cli-core/env/document";
import {
  ignoredFor,
  minted,
  neverStore,
  pushableVariables,
  selectForPush,
} from "@devdogsuga/cli-core/env/selection";
import {
  bail,
  errorMessage,
  explain,
  explainError,
  unwrap,
} from "@devdogsuga/cli-core/ui";

export interface EnvOptions {
  /**
   * Typed as any `EnvTarget` rather than a `VaultTarget`, on purpose.
   * `development` has to REACH these commands so each can refuse it by name.
   * Narrowing here would move the refusal back into the argument parser, which
   * is where it was missing.
   */
  target: EnvTarget;
  /** Overrides the file the target implies. */
  file?: string;
  yes?: boolean;
  /** `audit` only: delete the Worker secrets no app declares. */
  prune?: boolean;
  /** `--access-token`: counts as a Bitwarden credential for `audit`'s mode. */
  accessToken?: string;
}

/**
 * Whether `audit` can only look at Cloudflare.
 *
 * `--no-env` says the caller supplied the environment and there is no env file
 * to compare. Without a terminal and without a Secrets Manager token there is
 * no way to reach Bitwarden either (the vault and the prompt are interactive),
 * and a job in that position (CI's orphan audit holds only the Cloudflare
 * token) must not fail on a store it was never given. With a terminal the
 * full audit stays the default, and finds its token the usual ways.
 */
export function cloudflareOnlyAudit(
  options: Pick<EnvOptions, "accessToken">,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isNoEnv()) return true;
  const hasBitwarden = Boolean(options.accessToken ?? env.BWS_ACCESS_TOKEN);
  return isNonInteractive() && !hasBitwarden;
}

/**
 * The Cloudflare half of `audit`, alone: the Worker-secret orphan check the old
 * `deploy orphans` made. Says which stores it skipped, and exits 0 when it only
 * found orphans; only a real error (no token, a refused prune, a failed
 * deletion) is non-zero.
 */
async function runCloudflareOnlyAudit(options: EnvOptions): Promise<void> {
  const target = options.target;
  assertVaultTarget(target);
  log.info(
    `Auditing Worker secrets on Cloudflare only. Skipped: the env file, ` +
      `Bitwarden and GitHub (${isNoEnv() ? "--no-env" : "no Bitwarden access token and no terminal"}). ` +
      `Drift between those stores is not checked in this mode.`,
  );
  requireCloudflareToken("audit Worker secrets");
  const { secrets, unreadable } = await listWorkerSecrets(target);
  if (unreadable.length > 0) {
    log.warn(
      `Could not read Worker secrets for: ${unreadable.join(", ")}. ` +
        `Usually means the Worker has not been deployed yet.`,
    );
  }
  await reportOrphans(target, secrets, options);
}

/** Today, as an ISO date. Separated so the document layer stays testable. */
function stampFor(target: VaultTarget, action: Stamp["action"]): Stamp {
  return {
    environment: target,
    action,
    date: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Names every key the file holds that no manifest declares.
 *
 * Loud on purpose, and per key: an undeclared key used to be pushed as a secret
 * BY OMISSION, so a typo'd name uploaded garbage under the wrong key and a
 * stray local variable uploaded something private. Now it is skipped, and the
 * person who typed the line has to hear that. Silence would read as "stored"
 * right up until a deploy goes looking for it.
 */
function warnUnknown(unknown: string[]): void {
  for (const key of unknown) {
    log.warn(
      `${key} is declared in no env manifest, so it was NOT pushed. If it is ` +
        `real, declare it with define() in the owning package's env.ts so it ` +
        `can be classified and routed; if it is a typo or a stray local ` +
        `variable, fix or remove the line.`,
    );
  }
}

/**
 * Says out loud that a refused credential was left behind.
 *
 * A warning rather than a hard stop, because a never-store key can be
 * legitimately in `.env` for an operator's own use, and blocking the whole
 * push then would be wrong. But never silence: somebody who put a token in
 * the file expecting it to sync has to learn that it did not.
 */
function warnRefused(refused: string[]): void {
  for (const key of refused) {
    if (key === "BWS_ACCESS_TOKEN") {
      log.warn(
        `${key} was NOT uploaded, and must not be — it unlocks all three ` +
          `Bitwarden projects, so storing it in one is a key locked inside the ` +
          `box it opens. ⚠️ Remove it from your .env; export it per shell from ` +
          `the Password Manager vault instead.`,
      );
    } else {
      log.warn(
        `${key} was NOT uploaded, and must not be. See its define() doc in ` +
          `the owning package's env.ts for why.`,
      );
    }
  }
}

/**
 * Says that some lines were left to the registry rather than stored.
 *
 * `info`, not `warn`: this is the correct outcome, and the eight lines it
 * covers are ones `env init --target` WROTE. Silence would be the problem.
 * Somebody who filled in a file and pushed it has to be able to tell "your
 * derivations were left alone, on purpose" from "your derivations were
 * dropped", and before this the tool said neither.
 */
function noteDerived(derived: string[]): void {
  if (derived.length === 0) return;
  log.info(
    `${derived.length} value(s) were left to the registry: ${derived.join(", ")}. ` +
      "Each is still exactly the derivation its declaration gives — a shape " +
      "rather than a value — so storing it would freeze today's formula into " +
      "Bitwarden and GitHub and stop the registry from ever changing it. The " +
      "deploy expands them at compose time instead. Replace one with a real " +
      "value if this target genuinely differs, and it will push.",
  );
}

// ── pull ─────────────────────────────────────────────────────────────────────

/**
 * Brings Bitwarden's values into the target's env file, in place.
 *
 * ⚠️ With `--file .env` (or `--target development`, which is refused) this is
 * the file `pnpm dev` reads. Pulling `production` into it points local
 * development at production, which is why that target warns and defaults its
 * confirmation to no.
 */
export async function runEnvPull(options: EnvOptions): Promise<void> {
  assertVaultTarget(options.target);
  const target = options.target;
  const spec = environmentSpecs()[target];
  const path = pathFor(target, options.file);

  const projectId = await projectIdFor(spec.project);
  const refused = neverStore();
  // Product credentials share this project; the platform owns only bare keys.
  const all = (await listBwsSecrets(projectId)).filter(
    (s) => !s.key.includes("/"),
  );

  // If one of these is in the project it should not be, and writing it into the
  // file people run `pnpm dev` against would spread it further. The audit says
  // so loudly; here it is simply not written.
  const remote = new Map(
    all.filter((s) => !refused.has(s.key)).map((s) => [s.key, s.value]),
  );
  for (const s of all) {
    if (refused.has(s.key)) {
      log.warn(
        `${s.key} is in ${spec.project} and must not be. Not written to ${path}. ` +
          `Delete it there — run \`pnpm devtools env audit --target ${target}\`.`,
      );
    }
  }

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
      `This writes PRODUCTION values into ${path}. Anything that loads that ` +
        `file — or a stray \`--file .env\` — is then pointed at production.`,
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

  const stamp = stampFor(target, "pulled");
  for (const [key, value] of remote) doc.set(key, value, stamp);
  const moved = await save(path, doc);

  log.success(
    `Updated ${changes.length} value(s) in ${path}` +
      (moved ? ", and grouped same-named lines together." : "."),
  );
}

// ── push ─────────────────────────────────────────────────────────────────────

/**
 * Sends the target's env file to Bitwarden and then on to GitHub.
 *
 * Both, always. Bitwarden alone is the failure this design has: the source of
 * truth moves, the deploy does not, and everything looks healthy until the old
 * credential is revoked.
 *
 * ⚠️ The file comes from the TARGET. `--target staging` reads `.env.staging`,
 * not the root `.env`. That defaulting mistake meant this command uploaded a
 * developer's own values to a shared project and said "3 created, 12 updated"
 * about it.
 *
 * ⚠️ Two GitHub stores on the far side, and only one Bitwarden project. The
 * public per-environment values become GitHub *variables* rather than secrets
 * (see `gh/client.ts` for why the store matters), but they are stored in
 * Bitwarden alongside the secrets, because "Bitwarden is the source of truth"
 * has to be true of a WHOLE target for `pull` to rebuild a working env file.
 * Splitting them would make GitHub the only home for 27 keys and the second
 * source of truth for their values, which is the arrangement this tool exists
 * to remove.
 */
export async function runEnvPush(options: EnvOptions): Promise<void> {
  assertVaultTarget(options.target);
  const target = options.target;
  const spec = environmentSpecs()[target];
  const path = pathFor(target, options.file);
  const doc = await readDocument(path);
  const skip = ignoredFor(target);

  const {
    push: secrets,
    variables: publicValues,
    refused,
    unknown,
    derived,
  } = selectForPush(doc.entries(), target);
  warnRefused(refused);
  warnUnknown(unknown);
  noteDerived(derived);
  const { values: derivedBuild, unresolved } = derivedBuildValues(
    doc.entries(),
    derived,
  );
  if (unresolved.length > 0) {
    log.warn(
      `${unresolved.join(", ")} ${unresolved.length === 1 ? "is" : "are"} ` +
        "build: true and derived, but a value they derive from is missing " +
        "from the file, so the build environment was NOT given a computed copy.",
    );
  }

  // What Bitwarden holds: both halves, keyed together. The two are disjoint by
  // construction (see `selection.ts`), so this loses nothing.
  const stored = new Map([...secrets, ...publicValues]);

  if (stored.size === 0) {
    explain(`No pushable values in ${path}.`, "", [
      "Committed defaults, per-developer values and empty values are skipped.",
      derived.length > 0
        ? `The ${derived.length} line(s) named above are still their declared ` +
          "derivations, which the registry expands at deploy time."
        : "Nothing else was found.",
    ]);
    process.exitCode = 1;
    return;
  }

  const projectId = await projectIdFor(spec.project);
  const existing = (await listBwsSecrets(projectId)).filter(
    (s) => !s.key.includes("/"),
  );
  const index = byKey(existing);

  const created: string[] = [];
  const updated: string[] = [];
  for (const [key, value] of stored) {
    const current = index.get(key);
    if (!current) created.push(key);
    else if (current.value !== value) updated.push(key);
  }
  // Present in the project and absent from the file. NEVER removed, only
  // reported: a key missing from a file is far more often an incomplete edit
  // than an intentional deletion.
  const orphaned = existing
    .map((s) => s.key)
    .filter((k) => !stored.has(k) && !skip.has(k));

  if (created.length === 0 && updated.length === 0) {
    log.success(`${spec.project} already matches ${path}.`);
    if (orphaned.length > 0) {
      log.warn(
        `${orphaned.length} secret(s) exist in the project and not in ${path}: ` +
          `${orphaned.join(", ")}. They were left alone.`,
      );
    }
  } else {
    // Fingerprints for the public values too, not their plaintext. They are
    // safe to print, but "values are never printed" is a rule worth stating
    // without an exception, and a fingerprint answers the question anybody is
    // asking here: rotation, or paste error?
    note(
      [
        ...created.map((k) => `+ ${k}  (${fingerprint(stored.get(k)!)})`),
        ...updated.map(
          (k) =>
            `~ ${k}  ${fingerprint(index.get(k)!.value)} → ${fingerprint(stored.get(k)!)}`,
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

    // Writes are paced ~1.1s apart, under Bitwarden's published 60-POSTs-a-
    // minute limit (see bws/pace.ts). Said out loud for a big push, because a
    // minute of silence reads as a hang and gets Ctrl-C'd.
    const writes = created.length + updated.length;
    if (writes > 5) {
      log.info(
        `Writing ${writes} secrets, paced to stay under Bitwarden's rate ` +
          `limit — about ${Math.ceil((writes * 1.1) / 10) * 10} seconds.`,
      );
    }
    for (const key of created) {
      await createSecret(projectId, key, stored.get(key)!, MANAGED);
    }
    for (const key of updated) {
      await updateSecret(index.get(key)!, stored.get(key)!, MANAGED);
    }
    log.success(
      `${spec.project}: ${created.length} created, ${updated.length} updated.`,
    );
  }

  await pushToGithub(target, secrets, publicValues, options.yes, derivedBuild);

  // Record what went where, in the file itself. Values are untouched, since
  // this rewrites the trailing comment only, so it needs no confirmation. It is
  // what makes a stale file say so rather than look freshly synced.
  const stamp = stampFor(target, "pushed");
  for (const [key, value] of stored) doc.set(key, value, stamp);
  await save(path, doc);
}

const MANAGED = "Managed by `backstage env push`.";

/**
 * The second half of every push.
 *
 * One Bitwarden project can feed more than one GitHub environment, and which
 * key goes where is the reviewer gate (apply-tier keys only reach an
 * environment with required reviewers). Today each project feeds exactly one
 * environment, but this loops over the routed targets rather than assuming
 * one, and confirms each separately.
 *
 * The two maps stay two maps all the way down to the two `gh` calls. Merging
 * them and branching at the bottom would put "which store does this go to?" one
 * boolean away from being wrong, and getting it wrong in the variable direction
 * publishes a credential's plaintext to everyone who can read the repository's
 * Actions config.
 *
 * Exported ONLY so dispatch can be tested against a mocked `gh` client. The two
 * `setSecret`/`setVariable` lines below are the one place where a swap is
 * silent, irreversible, and invisible to `selection.ts`'s tests.
 */
export async function pushToGithub(
  target: VaultTarget,
  secrets: Map<string, string>,
  publicValues: Map<string, string>,
  yes?: boolean,
  // Expanded derived build keys (`derived-build.ts`). Variables-only
  // environments ONLY: the deployed ones expand a derivation themselves.
  derivedBuild: ReadonlyMap<string, string> = new Map(),
): Promise<void> {
  const project = environmentSpecs()[target].project;

  // `ghEnvironment`, not `target`: a GitHub environment is a THIRD vocabulary
  // (`production-build` is one and is not an env target at all, though a push
  // for `production` now feeds it), so it keeps a name of its own. Reusing `target` here is how the two
  // vocabularies got confused in the first place.
  for (const ghEnvironment of githubTargets(project)) {
    // Routing applies to both stores, and the two loops below are the same
    // filter twice rather than one filter and a branch. See the header.
    //
    // The gate is `preflight`/`staging` `excludeKeys`: the apply-tier
    // credential reaches only `production`, behind required reviewers.
    //
    // A variables-only environment (`staging-build`, `production-build`) gets
    // NO secrets, whatever `accepts()` says: its contents are readable by
    // anyone who can read the Actions config, so the store is refused here
    // rather than relying on the key set alone being clean.
    const variablesOnly = GITHUB_ENVIRONMENT_SPECS[ghEnvironment].variablesOnly;
    const chosenSecrets = new Map(
      variablesOnly
        ? []
        : [...secrets].filter(([key]) => accepts(ghEnvironment, key)),
    );
    const chosenVariables = new Map(
      [...publicValues, ...(variablesOnly ? derivedBuild : [])].filter(
        ([key]) => accepts(ghEnvironment, key),
      ),
    );
    const total = chosenSecrets.size + chosenVariables.size;
    if (total === 0) continue;

    const knownSecrets = new Set<string>();
    const knownVariables = new Set<string>();
    try {
      if (!variablesOnly) {
        for (const s of await listGhSecrets(ghEnvironment)) {
          knownSecrets.add(s.name);
        }
      }
      for (const v of await listGhVariables(ghEnvironment)) {
        knownVariables.add(v.name);
      }
    } catch (err) {
      // The deployed environments are required, so a failure there ends the
      // push as it always did. A build environment is an addition to a push
      // that has otherwise succeeded, and the repository `gh` points at may
      // not have one (DevDogsUGA has no `staging-build`), so it is reported
      // and skipped rather than failing a push whose other half is done.
      if (!variablesOnly) throw err;
      log.warn(
        `Skipped \`${ghEnvironment}\`: could not read it (${errorMessage(err).split("\n")[0]}). ` +
          "Create it with `backstage github settings --apply` in the " +
          "repository `gh` targets, then push again.",
      );
      continue;
    }
    const fresh =
      [...chosenSecrets.keys()].filter((k) => !knownSecrets.has(k)).length +
      [...chosenVariables.keys()].filter((k) => !knownVariables.has(k)).length;

    if (!yes) {
      const ok = unwrap(
        await confirm({
          message: variablesOnly
            ? `Sync ${chosenVariables.size} build variable(s) (variables ` +
              `only, no secrets) to the \`${ghEnvironment}\` GitHub ` +
              `environment (${fresh} new)?`
            : `Sync ${chosenSecrets.size} secret(s) and ` +
              `${chosenVariables.size} variable(s) to the \`${ghEnvironment}\` ` +
              `GitHub environment (${fresh} new)?`,
          // The gated environments hold what a reviewer is meant to see before
          // it can be used, so the default answer there is no.
          initialValue: !GITHUB_ENVIRONMENT_SPECS[ghEnvironment].guarded,
        }),
      );
      if (!ok) {
        log.warn(
          `Skipped \`${ghEnvironment}\`. ⚠️ Bitwarden is now ahead of GitHub ` +
            `— the deploy still uses the previous values. Run \`pnpm devtools ` +
            `env audit --target ${target}\` when you fix it.`,
        );
        continue;
      }
    }

    // Sequential. `gh` is one process per secret, and a burst of them against
    // the same environment is a good way to meet a secondary rate limit. That
    // leaves the set half-applied, the one outcome worse than not having
    // started.
    for (const [key, value] of chosenSecrets)
      await setSecret(ghEnvironment, key, value);
    for (const [key, value] of chosenVariables) {
      await setVariable(ghEnvironment, key, value);
    }
    log.success(
      variablesOnly
        ? `Synced ${chosenVariables.size} build variable(s) to ` +
            `\`${ghEnvironment}\`.`
        : `Synced ${chosenSecrets.size} secret(s) and ` +
            `${chosenVariables.size} variable(s) to \`${ghEnvironment}\`.`,
    );
  }
}

// ── audit ────────────────────────────────────────────────────────────────────

/** Read-only, and safe to run against anything. */
export async function runEnvAudit(options: EnvOptions): Promise<void> {
  assertVaultTarget(options.target);
  if (cloudflareOnlyAudit(options)) {
    await runCloudflareOnlyAudit(options);
    return;
  }
  const target = options.target;
  const spec = environmentSpecs()[target];
  // The target's own file, like pull and push. Auditing `--target staging`
  // against the development `.env` reported drift on every key that legitimately
  // differs between the two, which is most of them.
  const path = pathFor(target, options.file);
  const doc = await readDocument(path);

  const projectId = await projectIdFor(spec.project);
  const bwsSecrets = (await listBwsSecrets(projectId)).filter(
    (s) => !s.key.includes("/"),
  );

  // Every GitHub environment this project feeds, so that a key sitting in the
  // WRONG one is visible rather than merely absent from the right one. Both
  // stores are read for each: a key in the wrong STORE is as invisible to a
  // presence check as one in the wrong environment, and more dangerous.
  const github: GithubEntry[] = [];
  const githubVariables: GithubVariableEntry[] = [];
  const unreachable: GithubEnvironment[] = [];
  for (const ghEnvironment of githubTargets(spec.project)) {
    try {
      // Both reads complete before either is recorded. Half an environment is
      // worse than none of it: the secrets alone, with the environment then
      // marked unreachable, would leave every variable it holds looking like a
      // GitHub orphan that somebody should delete.
      const secrets = await listGhSecrets(ghEnvironment);
      const variables = await listGhVariables(ghEnvironment);
      for (const secret of secrets) {
        github.push({
          environment: ghEnvironment,
          name: secret.name,
          updatedAt: secret.updatedAt,
        });
      }
      for (const variable of variables) {
        githubVariables.push({
          environment: ghEnvironment,
          name: variable.name,
          value: variable.value,
          updatedAt: variable.updatedAt,
        });
      }
    } catch {
      // Usually an environment nobody has created yet. Reported, then routed
      // around: inventing "missing from GitHub" for every key in an
      // environment that could not be read would bury everything else.
      unreachable.push(ghEnvironment);
    }
  }

  // The repository's own variables, which no environment read can see and push
  // never writes. Failure is CARRIED rather than thrown or flattened to `[]`:
  // this list can be unreadable where the environment ones are readable, and an
  // audit that quietly downgraded "could not look" to "nothing there" would
  // report the exact hazard it was added to catch as health.
  let repositoryVariables: RepositoryVariableScan;
  try {
    repositoryVariables = {
      readable: true,
      names: (await listRepositoryVariables()).map((v) => v.name),
    };
  } catch (err) {
    const firstLine = errorMessage(err).split("\n")[0]?.trim() ?? "";
    repositoryVariables = {
      readable: false,
      // The FIRST line only. `describe()` in the gh client returns a paragraph
      // of guidance, and a finding is one line. The rest is reproducible by
      // running the command the finding names.
      reason: firstLine || "`gh` failed",
    };
  }

  // Checked up front: without the token wrangler opens a browser login, which
  // reads as an invitation to authenticate. The audit goes on without
  // Cloudflare and says so.
  const cloudflareChecked = Boolean(process.env.CLOUDFLARE_API_TOKEN);
  const { secrets: cloudflare, unreadable } = cloudflareChecked
    ? await listWorkerSecrets(target)
    : { secrets: new Map<string, Set<string>>(), unreadable: [] };
  if (!cloudflareChecked) {
    log.warn(
      "CLOUDFLARE_API_TOKEN is not set, so Worker secrets were NOT checked " +
        "(devops-only; `env pull --target production` fills it in).",
    );
  }

  const commented = new Set(
    bwsSecrets.map((s) => s.key).filter((k) => doc.isCommented(k)),
  );

  const findings = audit({
    local: new Map(doc.entries()),
    localCommented: commented,
    bws: new Map(
      bwsSecrets.map((s) => [
        s.key,
        { value: s.value, revisionDate: s.revisionDate },
      ]),
    ),
    github,
    githubVariables,
    // Which store each key belongs in. Read from the registry rather than
    // inferred from where a copy turned up: otherwise a misplaced key would
    // define its own correctness and never be reported.
    variables: pushableVariables(),
    route: (key) => {
      const routed = routeTo(spec.project, key);
      return routed && unreachable.includes(routed) ? null : routed;
    },
    // Every environment that must hold the key: the primary plus, for a
    // `build: true` key, `<target>-build`. A target that could not be read is
    // left out for the reason `route` leaves it out.
    routes: (key) =>
      acceptedBy(spec.project, key).filter((e) => !unreachable.includes(e)),
    // Whether a copy outside `route`'s environment is legitimate. Comparing
    // against `route` alone would report every second copy as a stray,
    // burying the one that matters: an apply-tier key in an environment
    // without required reviewers. `acceptsKey()` says no to that one, and is a
    // name rather than a lambda so it has tests of its own.
    accepted: acceptsKey,
    derivedBuild: new Map(
      [
        ...derivedBuildValues(
          doc.entries(),
          selectForPush(doc.entries(), target).derived,
        ).values,
      ].map(([key, value]) => [
        key,
        {
          value,
          environments: githubTargets(spec.project).filter(
            (e) =>
              GITHUB_ENVIRONMENT_SPECS[e].variablesOnly &&
              accepts(e, key) &&
              !unreachable.includes(e),
          ),
        },
      ]),
    ),
    cloudflare,
    ignore: ignoredFor(target),
    neverStore: neverStore(),
    // Keeps the Worker's minted credential from being reported as a Cloudflare
    // orphan, and so from being pruned, while still flagging a stored copy.
    minted: minted(),
    // Lets the audit tell "undeclared" apart from drift: the fix for one is a
    // define() in a manifest, for the other a push or a pull.
    declared: new Set(getEnvSync().variables().keys()),
    // The scope nothing else here addresses. Passed as the scan rather than as
    // a list so that `audit` can tell "checked, clean" from "could not check".
    repositoryVariables,
  });

  note(renderFindings(findings), `${target} (${path}) — drift`);

  if (unreachable.length > 0) {
    log.warn(
      `Could not read the ${unreachable.join(", ")} GitHub environment(s), so ` +
        `nothing was checked there. Usually means it does not exist yet.`,
    );
  }
  if (unreadable.length > 0) {
    log.warn(
      `Could not read Worker secrets for: ${unreadable.join(", ")}. ` +
        `Usually means the Worker has not been deployed yet.`,
    );
  }

  // Said explicitly, because "no drift" reads as a stronger claim than it is,
  // and is now a stronger claim for some keys than for others. That is the sort
  // of difference a summary line loses.
  log.info(
    "GitHub *secrets* and Cloudflare secrets are write-only: those were " +
      "checked for presence, for routing, and for whether GitHub's copy " +
      "predates the Bitwarden revision — a changed value is undetectable. " +
      "GitHub *variables* are readable, so the public per-environment keys " +
      "were compared by VALUE, as your env file and Bitwarden were. " +
      // Stated only when it is true. The claim is the coverage itself, so
      // printing it unconditionally would turn the one run that could not look
      // into the one run that says it did.
      (repositoryVariables.readable
        ? "The repository's own variables were listed too, and checked for " +
          "names that an environment copy would shadow."
        : "The repository's own variables could NOT be listed, so nothing " +
          "above rules out a shadowed copy at that scope."),
  );

  if (cloudflareChecked) await reportOrphans(target, cloudflare, options);

  if (hasErrors(findings)) process.exitCode = 1;
}

/**
 * Worker secrets no app declares, found by the same audit that already listed
 * the Workers (this replaces `deploy orphans`).
 *
 * Reported always. Deleted only on request: `--prune`, or the offer made at a
 * terminal right after the report. Either way it asks first unless `--yes`
 * answers, because each deletion publishes a new version of the code already
 * deployed, and nothing but a person (or the reviewed `production` environment
 * approving a CI run that passed `--yes`) should trigger that. Without a
 * terminal and without `--prune` it only reports.
 */
async function reportOrphans(
  target: VaultTarget,
  cloudflare: ReadonlyMap<string, ReadonlySet<string>>,
  options: EnvOptions,
): Promise<void> {
  // The preflight tier has no Workers.
  if (target === "preflight") return;

  const orphans = findOrphans(target, cloudflare);
  if (orphans.length === 0) {
    log.success("No Worker secret is unaccounted for.");
    return;
  }

  const byWorker = new Map<string, string[]>();
  for (const { worker, key } of orphans) {
    byWorker.set(worker, [...(byWorker.get(worker) ?? []), key]);
  }
  note(
    [...byWorker]
      .map(([worker, keys]) => `${worker}: ${keys.join(", ")}`)
      .join("\n"),
    `${target} — Worker secrets no app declares`,
  );

  const question =
    `Delete ${orphans.length} Worker secret(s)? Each deletion publishes a new ` +
    "version of the code already deployed; a secret that turns out to be " +
    "live comes back with the next deploy, after an outage.";
  const ask = async (): Promise<boolean> =>
    unwrap(await confirm({ message: question, initialValue: false }));

  // `--prune` asks unless `--yes` answered; without it, only a terminal gets
  // the offer. Never an unprompted delete.
  let go: boolean;
  if (options.prune === true) {
    if (options.yes === true) go = true;
    else if (isNonInteractive()) {
      log.error(
        "Nothing to confirm with: pass --yes to prune without a terminal.",
      );
      process.exitCode = 1;
      return;
    } else go = await ask();
  } else {
    if (isNonInteractive()) return;
    go = await ask();
  }
  if (!go) {
    log.info("Left the Worker secrets alone.");
    return;
  }

  requireCloudflareToken("delete a Worker secret");
  const { pruned, failed } = pruneOrphans(
    orphans,
    target,
    deleteOrphanViaWrangler,
  );
  for (const { worker, key } of pruned)
    log.success(`Deleted ${key} from ${worker}.`);
  if (failed) {
    log.error(
      `Could not delete ${failed.key} from ${failed.worker}; wrangler's own message is above.`,
    );
    process.exitCode = 1;
  }
}

// ── reset ────────────────────────────────────────────────────────────────────

/**
 * `env <pull|push|audit> --target <preflight|staging|production>`.
 *
 * The target has no default, and is asked for when `--target` is absent.
 * Every other command in the CLI defaults to something safe because guessing
 * wrong is free; guessing wrong about whose credentials to overwrite is not.
 *
 * One flag, one vocabulary. `--target` names a row in the target table, and
 * the file, the Bitwarden project and whether `DEPLOY_ENV` may say it all come
 * from that row.
 */
async function runEnvCommand(rest: string[]): Promise<void> {
  // `positionals` rather than `rest[0]`, so the VALUE of a flag never becomes
  // the subcommand: in `env --file production pull`, `production` is a
  // filename and must not be read as anything else.
  const [sub] = positionals(rest);

  // Validated against the command tree rather than a list kept here. One
  // declaration means a subcommand cannot exist in the CLI and be missing
  // from the menu, or the reverse.
  if (!sub || !catalog.subcommandNames(["env"]).includes(sub)) {
    log.error(`Unknown env subcommand: ${sub ?? "(none)"}`);
    log.message(`Try ${catalog.subcommandList(["env"])}.`);
    process.exitCode = 1;
    return;
  }

  // `--repo <product>` points the same commands at a product repository. It
  // needs no registry (a product has no manifests), so it branches off first.
  const repoFlag = flagValue(rest, "--repo");
  if (repoFlag !== undefined) {
    await runProductEnvCommand(sub, repoFlag, rest);
    return;
  }

  // Every subcommand reads the registry, which fills only when the env
  // manifests are imported. Loaded HERE, lazily, rather than at CLI start.
  await loadRegistry();

  // The question names the direction, because the answer means something
  // different each way: pull overwrites your file, push overwrites theirs.
  const target = await resolveVaultTarget(
    flagValue(rest, "--target"),
    sub === "pull"
      ? "Which target should I pull into its env file?"
      : sub === "push"
        ? "Which target should I push its env file to?"
        : "Which target should I audit?",
  );
  if (!target) {
    process.exitCode = 1;
    return;
  }

  // A target chosen at the prompt (not passed as a flag) is what the rerun
  // line needs to skip that prompt next time.
  if (flagValue(rest, "--target") === undefined) {
    recordResolved("--target", target);
  }

  // Before any command runs, so every `bws` call in it sees the same token.
  setExplicitAccessToken(flagValue(rest, "--access-token"));

  if (rest.includes("--prune") && sub !== "audit") {
    log.error("--prune belongs to `env audit`.");
    process.exitCode = 1;
    return;
  }

  const options = {
    target,
    file: flagValue(rest, "--file"),
    yes: rest.includes("--yes"),
    prune: rest.includes("--prune"),
    accessToken: flagValue(rest, "--access-token"),
  };

  try {
    if (sub === "pull") await runEnvPull(options);
    else if (sub === "push") await runEnvPush(options);
    else await runEnvAudit(options);
  } catch (err) {
    explainError("The env command failed.", err, [
      "The access token is read from --access-token, then BWS_ACCESS_TOKEN,",
      "then your Bitwarden vault, and finally by asking.",
      "`gh auth status` shows whether the GitHub CLI is signed in.",
    ]);
    process.exitCode = 1;
  }
}

/** `env <pull|push|audit> --repo <product> --target <target>`; see `product.ts`. */
async function runProductEnvCommand(
  sub: string,
  repoFlag: string,
  rest: string[],
): Promise<void> {
  const product = resolveProduct(repoFlag);
  if (!product) {
    process.exitCode = 1;
    return;
  }
  if (rest.includes("--prune")) {
    log.error(
      "--prune belongs to the platform's `env audit`; products have no Workers here.",
    );
    process.exitCode = 1;
    return;
  }
  const target = await resolveProductTarget(
    flagValue(rest, "--target"),
    sub === "pull"
      ? `Which ${product} target should I pull into its env file?`
      : sub === "push"
        ? `Which ${product} target should I push its env file to?`
        : `Which ${product} target should I audit?`,
  );
  if (!target) {
    process.exitCode = 1;
    return;
  }
  if (flagValue(rest, "--target") === undefined) {
    recordResolved("--target", target);
  }
  setExplicitAccessToken(flagValue(rest, "--access-token"));

  const options = {
    product,
    target,
    file: flagValue(rest, "--file"),
    checkout: flagValue(rest, "--checkout"),
    yes: rest.includes("--yes"),
  };
  try {
    if (sub === "pull") await runProductPull(options);
    else if (sub === "push") await runProductPush(options);
    else await runProductAudit(options);
  } catch (err) {
    explainError("The env command failed.", err, [
      "The access token is read from --access-token, then BWS_ACCESS_TOKEN,",
      "then your Bitwarden vault, and finally by asking.",
      "`gh auth status` shows whether the GitHub CLI is signed in.",
      `A missing project is created by hand in Secrets Manager: ${product}-<target>.`,
    ]);
    process.exitCode = 1;
  }
}

export const handleEnv: CommandHandler = async (rest) => {
  await runEnvCommand(rest);
  return DONE;
};
