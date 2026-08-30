/**
 * `pnpm devtools env <pull|push|audit> --target <target>`
 *
 * One local env file per target, three remote stores, and a source of truth:
 *
 *   pull   Bitwarden into your env file
 *   push   your env file to Bitwarden, then to GitHub secrets AND variables
 *   audit  compare the file, Bitwarden, GitHub and Cloudflare
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
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { confirm, log, note } from "@clack/prompts";
import { fileFor, variables, type EnvTarget } from "@devdogsuga/env";
import {
  createSecret,
  listSecrets as listBwsSecrets,
  byKey,
  projectIdFor,
  updateSecret,
} from "../bws/client.js";
import {
  ENVIRONMENT_SPECS,
  assertVaultTarget,
  type VaultTarget,
} from "../bws/environments.js";
import { fingerprint } from "../fingerprint.js";
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
import { EnvDocument, type Stamp } from "./document.js";
import {
  ignoredFor,
  minted,
  neverStore,
  pushableVariables,
  selectForPush,
} from "./selection.js";
import { PROJECT_ROOT } from "../instance.js";
import { bail, errorMessage, explain, unwrap } from "../ui.js";

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
}

async function readDocument(path: string): Promise<EnvDocument> {
  try {
    return EnvDocument.parse(await readFile(path, "utf8"));
  } catch {
    return EnvDocument.empty();
  }
}

/**
 * The file a command works on: the target's, unless `--file` overrides it.
 *
 * The default is the whole fix. `--target staging` now reads and writes
 * `.env.staging` for pull, push AND audit, where it used to reach the root
 * `.env`. That meant pushing "staging" uploaded the development values, and
 * pulling "staging" overwrote the development file. Every caller passes the
 * target explicitly so no future one can inherit `.env` by omission.
 */
function pathFor(target: EnvTarget, file?: string): string {
  return resolve(PROJECT_ROOT, file ?? fileFor(target));
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
 * Writes the document, tidying first.
 *
 * `group()` runs on every write rather than as its own command: files drift a
 * line at a time, and a tidy pass nobody remembers to run is a tidy pass that
 * never happens.
 */
async function save(path: string, doc: EnvDocument): Promise<boolean> {
  const moved = doc.group();
  await writeFile(path, doc.toString());
  return moved;
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
 * A warning rather than a hard stop, because `AIRTABLE_PAT` is legitimately in
 * `.env` while somebody is scaffolding the base, and blocking the whole push
 * then would be wrong. But never silence: somebody who put a token in the file
 * expecting it to sync has to learn that it did not.
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
        `${key} was NOT uploaded, and must not be. The runtime reads its own, ` +
          `narrower token from Supabase Vault — see docs/platform/airtable-setup.md.`,
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
  const spec = ENVIRONMENT_SPECS[target];
  const path = pathFor(target, options.file);

  const projectId = await projectIdFor(spec.project);
  const refused = neverStore();
  const all = await listBwsSecrets(projectId);

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
  const spec = ENVIRONMENT_SPECS[target];
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
  const existing = await listBwsSecrets(projectId);
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

  await pushToGithub(target, secrets, publicValues, options.yes);

  // Record what went where, in the file itself. Values are untouched, since
  // this rewrites the trailing comment only, so it needs no confirmation. It is
  // what makes a stale file say so rather than look freshly synced.
  const stamp = stampFor(target, "pushed");
  for (const [key, value] of stored) doc.set(key, value, stamp);
  await save(path, doc);
}

const MANAGED = "Managed by `pnpm devtools env push`.";

/**
 * The second half of every push.
 *
 * One Bitwarden project can feed more than one GitHub environment: `production`
 * feeds both `production` and `production-apply`, and which key goes where IS
 * the reviewer gate. So this loops over the routed targets rather than assuming
 * one, and confirms each separately. Agreeing to update production's ordinary
 * secrets is not agreeing to touch the two write-capable credentials sitting
 * behind the reviewers.
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
): Promise<void> {
  const project = ENVIRONMENT_SPECS[target].project;

  // `ghEnvironment`, not `target`: a GitHub environment is a THIRD vocabulary
  // (there are four of them, and `production-apply` is not an env target at
  // all), so it keeps a name of its own. Reusing `target` here is how the two
  // vocabularies got confused in the first place.
  for (const ghEnvironment of githubTargets(project)) {
    // Routing applies to both stores, and the two loops below are the same
    // filter twice rather than one filter and a branch. See the header.
    //
    // `production-apply` accepts everything `production` does plus the
    // apply-tier pair, so a production push writes MOST keys twice: once to the
    // unreviewed environment the deploy reads, once to the reviewed one whose
    // three jobs (`production-config`, `production-airtable`, `prune-orphans`)
    // were previously starved of them. That is not the gate leaking. The gate
    // is `production.excludeKeys`, which keeps the apply-tier pair out of the
    // FIRST environment; it has never had anything to say about the second.
    const chosenSecrets = new Map(
      [...secrets].filter(([key]) => accepts(ghEnvironment, key)),
    );
    const chosenVariables = new Map(
      [...publicValues].filter(([key]) => accepts(ghEnvironment, key)),
    );
    const total = chosenSecrets.size + chosenVariables.size;
    if (total === 0) continue;

    const knownSecrets = new Set(
      (await listGhSecrets(ghEnvironment)).map((s) => s.name),
    );
    const knownVariables = new Set(
      (await listGhVariables(ghEnvironment)).map((v) => v.name),
    );
    const fresh =
      [...chosenSecrets.keys()].filter((k) => !knownSecrets.has(k)).length +
      [...chosenVariables.keys()].filter((k) => !knownVariables.has(k)).length;

    if (!yes) {
      const ok = unwrap(
        await confirm({
          message:
            `Sync ${chosenSecrets.size} secret(s) and ` +
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
      `Synced ${chosenSecrets.size} secret(s) and ${chosenVariables.size} ` +
        `variable(s) to \`${ghEnvironment}\`.`,
    );
  }
}

// ── audit ────────────────────────────────────────────────────────────────────

/** Read-only, and safe to run against anything. */
export async function runEnvAudit(options: EnvOptions): Promise<void> {
  assertVaultTarget(options.target);
  const target = options.target;
  const spec = ENVIRONMENT_SPECS[target];
  // The target's own file, like pull and push. Auditing `--target staging`
  // against the development `.env` reported drift on every key that legitimately
  // differs between the two, which is most of them.
  const path = pathFor(target, options.file);
  const doc = await readDocument(path);

  const projectId = await projectIdFor(spec.project);
  const bwsSecrets = await listBwsSecrets(projectId);

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
    repositoryVariables = {
      readable: false,
      // The FIRST line only. `describe()` in the gh client returns a paragraph
      // of guidance, and a finding is one line. The rest is reproducible by
      // running the command the finding names.
      reason: errorMessage(err).split("\n")[0]?.trim() || "`gh` failed",
    };
  }

  const { secrets: cloudflare, unreadable } = await listWorkerSecrets(target);

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
    // Whether a SECOND copy is legitimate, which stopped being "the one place
    // `route` names" when `production-apply` became a superset of `production`.
    // A push now writes most production keys to both, and comparing against
    // `route` alone would report every one as a stray to delete, burying the one
    // stray that matters: an apply-tier key in the unreviewed environment.
    // `acceptsKey()` still says no to that one, and is a name rather than a
    // lambda so it has tests of its own.
    accepted: acceptsKey,
    cloudflare,
    ignore: ignoredFor(target),
    neverStore: neverStore(),
    // Keeps the Worker's minted credential from being reported as a Cloudflare
    // orphan, and so from being pruned, while still flagging a stored copy.
    minted: minted(),
    // Lets the audit tell "undeclared" apart from drift: the fix for one is a
    // define() in a manifest, for the other a push or a pull.
    declared: new Set(variables().keys()),
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

  if (hasErrors(findings)) process.exitCode = 1;
}

// ── reset ────────────────────────────────────────────────────────────────────

/**
 * Empties every value in a local env file, losing none of them.
 *
 * The use is handing a filled-in file back to its blank state: after pulling
 * production onto a laptop, before passing a machine on, or when a set of keys
 * has to be re-entered from scratch. Deleting the values would do that too, and
 * would also delete the only copy of anything that was never pushed. So each
 * becomes a commented line holding what it was, plus an empty active line
 * beneath. The file still declares every key it needs, which makes it a
 * checklist rather than a blank page.
 *
 * Purely local. It touches no remote store, so it takes no `--target`: asking
 * which target to clear a file against would imply it reaches one. It works on
 * `.env` unless `--file` says otherwise, and that default is written out here
 * rather than inherited, so the shared `pathFor` has no "no target" case for a
 * remote command to fall into.
 */
export async function runEnvReset(
  options: Pick<EnvOptions, "file" | "yes">,
): Promise<void> {
  const path = pathFor("development", options.file);
  const doc = await readDocument(path);

  const active = doc.entries().filter(([, value]) => value !== "");
  if (active.length === 0) {
    log.success(`Nothing to clear — every value in ${path} is already empty.`);
    return;
  }

  note(
    active
      .map(([key, value]) => `~ ${key}  ${fingerprint(value)} → empty`)
      .join("\n"),
    `${path} will be cleared`,
  );

  if (!options.yes) {
    const ok = unwrap(
      await confirm({
        message: `Clear ${active.length} value(s)? Each is kept, commented out, on the line above.`,
        initialValue: false,
      }),
    );
    if (!ok) bail("Nothing written.");
  }

  const cleared = doc.reset();
  await save(path, doc);

  log.success(`Cleared ${cleared.length} value(s) in ${path}.`);
  log.info(
    "Every previous value is still in the file, commented out. `env pull` " +
      "will fill them back in from Bitwarden.",
  );
}
