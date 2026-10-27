/**
 * `backstage env <pull|push|audit> --repo <product> --target <target>`
 *
 * The same three commands, pointed at a PRODUCT repository (DogDays, DogPack)
 * rather than at DevDogsUGA's own files:
 *
 *   pull   Bitwarden into the product checkout's env file
 *   push   that file to Bitwarden, then to the product repo's GitHub
 *          environment (secrets AND variables)
 *   audit  compare the file, Bitwarden and the GitHub environment
 *
 * Everything per-target comes from the one table in
 * `@devdogsuga/sdk/env/targets` (see "Product targets" there): the file is
 * `.env.<target>` inside the PRODUCT's checkout, the Bitwarden project is
 * the tier's project with keys as `<product>/<KEY>`, the GitHub repository is
 * the product's, and its environment is the target's own name.
 *
 * What differs from the platform path, and why it is a module of its own
 * rather than a flag on `commands.ts`:
 *
 *   * **No registry.** A product repo has no `define()` manifests, so there is
 *     nothing to classify a key as secret or public, to route it, or to call
 *     undeclared. The product's `variables` list (in the table) names the
 *     public keys; EVERYTHING ELSE is a secret. The failure direction is the
 *     safe one: a public key missing from the list is sealed and write-only,
 *     where the reverse mistake would publish a credential in plaintext.
 *   * **One GitHub environment per target**, and no `-build` twins, Cloudflare
 *     pass or Worker-secret pruning. `audit` reuses `audit()` unchanged, with
 *     the routing collapsed to that one environment.
 *   * **Every `gh` call carries `-R <repo>`**, because the working directory is
 *     a Backstage or DevDogsUGA clone, not the product.
 *
 * Both Bitwarden and GitHub are reached through `ProductEnvDeps`, so the tests
 * run the real planning against fakes and never touch a network.
 */
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { confirm, log, note, select } from "@clack/prompts";
import {
  PRODUCTS,
  PRODUCT_NAMES,
  TARGETS,
  VAULT_TARGETS,
  isProduct,
  isVaultTarget,
  productFileFor,
  productGithubEnvironment,
  productProjectFor,
  type Product,
  type VaultTarget,
} from "@devdogsuga/sdk/env/targets";
import { readDocument, save } from "@devdogsuga/cli-core/env/files";
import type { Stamp } from "@devdogsuga/cli-core/env/document";
import { fingerprint } from "@devdogsuga/cli-core/env/fingerprint";
import { discoverRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { explain, unwrap } from "@devdogsuga/cli-core/ui";
import {
  createSecret,
  listSecrets as listBwsSecrets,
  projectIdFor,
  updateSecret,
  type BwsSecret,
} from "../bws/client.js";
import {
  listRepositoryVariables,
  listSecrets as listGhSecrets,
  listVariables as listGhVariables,
  setSecret,
  setVariable,
} from "../gh/client.js";
import {
  audit,
  hasErrors,
  renderFindings,
  type GithubEntry,
  type GithubVariableEntry,
  type RepositoryVariableScan,
} from "./audit.js";

export interface ProductEnvOptions {
  product: Product;
  target: VaultTarget;
  /** Overrides the file the target implies. */
  file?: string;
  /** Overrides where the product checkout is looked for. */
  checkout?: string;
  yes?: boolean;
}

/** Everything that leaves the process. Fakes go here in tests. */
export interface ProductEnvDeps {
  bws: {
    projectIdFor: (name: string) => Promise<string>;
    listSecrets: (projectId: string) => Promise<BwsSecret[]>;
    createSecret: (
      projectId: string,
      key: string,
      value: string,
      note: string,
    ) => Promise<void>;
    updateSecret: (
      secret: BwsSecret,
      value: string,
      note: string,
    ) => Promise<void>;
  };
  gh: {
    listSecrets: (
      environment: string,
      repo: string,
    ) => Promise<{ name: string; updatedAt: string }[]>;
    listVariables: (
      environment: string,
      repo: string,
    ) => Promise<{ name: string; value: string; updatedAt: string }[]>;
    listRepositoryVariables: (
      repo: string,
    ) => Promise<{ name: string; updatedAt: string }[]>;
    setSecret: (
      environment: string,
      name: string,
      value: string,
      repo: string,
    ) => Promise<void>;
    setVariable: (
      environment: string,
      name: string,
      value: string,
      repo: string,
    ) => Promise<void>;
  };
}

const realDeps: ProductEnvDeps = {
  bws: {
    projectIdFor,
    listSecrets: listBwsSecrets,
    createSecret,
    updateSecret,
  },
  gh: {
    listSecrets: listGhSecrets,
    listVariables: listGhVariables,
    listRepositoryVariables,
    setSecret,
    setVariable,
  },
};

const MANAGED = "Managed by `backstage env push`.";

/**
 * Credentials that must never be stored remotely, for the same reason as the
 * platform's: it unlocks the vault this would be stored in.
 */
const NEVER_STORE: ReadonlySet<string> = new Set(["BWS_ACCESS_TOKEN"]);

/** Index by env name, retaining the original prefixed record for SDK updates. */
function productSecrets(
  secrets: BwsSecret[],
  product: Product,
): Map<string, BwsSecret> {
  const prefix = `${product}/`;
  const selected = new Map<string, BwsSecret>();
  for (const secret of secrets) {
    if (!secret.key.startsWith(prefix)) continue;
    const key = secret.key.slice(prefix.length);
    // Match EnvDocument's identifier grammar exactly. Never normalize a name:
    // doing so could turn a private credential into a public variable.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(
        `Invalid product env key ${JSON.stringify(secret.key)} (record ${secret.id}). Expected ${prefix}<KEY> with KEY matching [A-Za-z_][A-Za-z0-9_]*. No values were written.`,
      );
    }
    const previous = selected.get(key);
    if (previous) {
      throw new Error(
        `Duplicate product env key ${JSON.stringify(secret.key)} (records ${previous.id}, ${secret.id}). Resolve the ambiguity in Secrets Manager; no values were written.`,
      );
    }
    selected.set(key, secret);
  }
  return selected;
}

// ── where the checkout is ────────────────────────────────────────────────────

/** Whether `dir` is the checkout of `product` (its `devtools.config.json` says so). */
function isCheckoutOf(dir: string, product: Product): boolean {
  try {
    const config = JSON.parse(
      readFileSync(join(dir, "devtools.config.json"), "utf8"),
    ) as { product?: unknown };
    return config.product === product;
  } catch {
    return false;
  }
}

/**
 * Finds the product's checkout: `--checkout`, else the working directory (or a
 * parent) when it IS that product, else the product's directory beside the
 * DevDogsUGA or Backstage clone the command runs from.
 *
 * Returns the candidates tried when none exists, so the error can list them.
 */
export function resolveProductCheckout(
  product: Product,
  explicit?: string,
  cwd: string = process.cwd(),
  repoRoot: string | null = discoverRepoRoot(cwd),
): { path: string } | { tried: string[] } {
  if (explicit !== undefined) {
    const path = resolve(cwd, explicit);
    return existsSync(path) ? { path } : { tried: [path] };
  }
  const tried: string[] = [];
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (isCheckoutOf(dir, product)) return { path: dir };
    if (dirname(dir) === dir) break;
  }
  if (repoRoot !== null) {
    const sibling = resolve(repoRoot, "..", PRODUCTS[product].checkout);
    tried.push(sibling);
    if (existsSync(sibling)) return { path: sibling };
  }
  return { tried };
}

// ── what leaves the file ─────────────────────────────────────────────────────

export interface ProductSelection {
  secrets: Map<string, string>;
  variables: Map<string, string>;
  /** Present in the file and must not be stored remotely. */
  refused: string[];
  /** A name GitHub will not accept (it reserves the `GITHUB_` prefix). */
  invalid: string[];
}

/**
 * Which values of a product file go where. Pure.
 *
 * Empty values are skipped (an unfilled template line is not a credential).
 * The product's public keys become variables; everything else is a secret.
 */
export function selectProductPush(
  entries: Iterable<[string, string]>,
  product: Product,
): ProductSelection {
  const publicKeys = new Set<string>(PRODUCTS[product].variables);
  const out: ProductSelection = {
    secrets: new Map(),
    variables: new Map(),
    refused: [],
    invalid: [],
  };
  for (const [key, value] of entries) {
    if (value === "") continue;
    if (NEVER_STORE.has(key)) {
      out.refused.push(key);
    } else if (key.startsWith("GITHUB_")) {
      out.invalid.push(key);
    } else if (publicKeys.has(key)) {
      out.variables.set(key, value);
    } else {
      out.secrets.set(key, value);
    }
  }
  return out;
}

// ── target and product choice ────────────────────────────────────────────────

/** `null`: already explained, set an exit code and stop. */
export async function resolveProductTarget(
  given: string | undefined,
  message: string,
): Promise<VaultTarget | null> {
  if (given !== undefined) {
    if (isVaultTarget(given)) return given;
    explain(
      `"${given}" is not a product target.`,
      "",
      [
        `Try one of: ${VAULT_TARGETS.join(", ")}`,
        given === "development"
          ? "A product's `.env` is your own file; nothing is shared to sync it against."
          : "",
      ].filter(Boolean),
    );
    return null;
  }
  if (!process.stdin.isTTY) {
    explain("No target given, and there is nobody here to ask.", "", [
      `Pass --target: ${VAULT_TARGETS.join(" | ")}`,
    ]);
    return null;
  }
  // Least- to most-dangerous, like the platform's picker.
  return unwrap(
    await select({
      message,
      options: VAULT_TARGETS.map((value) => ({ value })),
    }),
  );
}

export function resolveProduct(given: string): Product | null {
  if (isProduct(given)) return given;
  explain(`"${given}" is not a product.`, "", [
    `Try one of: ${PRODUCT_NAMES.join(", ")}`,
  ]);
  return null;
}

// ── shared pieces ────────────────────────────────────────────────────────────

function context(options: ProductEnvOptions): {
  repo: string;
  project: string;
  ghEnvironment: string;
  path: string;
  guarded: boolean;
} | null {
  const { product, target } = options;
  const found = resolveProductCheckout(product, options.checkout);
  if ("tried" in found && options.file === undefined) {
    explain(`Could not find the ${PRODUCTS[product].checkout} checkout.`, "", [
      ...found.tried.map((p) => `Looked for it at ${p}`),
      `Pass --checkout <dir>, or run this from inside the ${PRODUCTS[product].checkout} clone.`,
    ]);
    process.exitCode = 1;
    return null;
  }
  const path =
    options.file !== undefined
      ? resolve(options.file)
      : resolve(
          (found as { path: string }).path,
          productFileFor(product, target),
        );
  return {
    repo: PRODUCTS[product].repo,
    project: productProjectFor(product, target),
    ghEnvironment: productGithubEnvironment(target),
    path,
    guarded: TARGETS[target].guarded,
  };
}

function stampFor(target: VaultTarget, action: Stamp["action"]): Stamp {
  return {
    environment: target,
    action,
    date: new Date().toISOString().slice(0, 10),
  };
}

function warnRefused(refused: string[], invalid: string[]): void {
  for (const key of refused) {
    log.warn(
      `${key} was NOT uploaded, and must not be: it unlocks the Bitwarden ` +
        "projects, so storing it in one is a key locked inside the box it " +
        "opens. Remove it from the file.",
    );
  }
  for (const key of invalid) {
    log.warn(
      `${key} was NOT uploaded: GitHub reserves names starting with GITHUB_.`,
    );
  }
}

const FIRST_TIME_HINT =
  "If this is the first time, fill the target's file from the hand-made " +
  "Bitwarden item (one KEY=value line per entry), then run `env push`.";

// ── pull ─────────────────────────────────────────────────────────────────────

export async function runProductPull(
  options: ProductEnvOptions,
  deps: ProductEnvDeps = realDeps,
): Promise<void> {
  const ctx = context(options);
  if (!ctx) return;
  const projectId = await deps.bws.projectIdFor(ctx.project);
  const all = productSecrets(
    await deps.bws.listSecrets(projectId),
    options.product,
  );

  const remote = new Map<string, string>();
  for (const [key, s] of all) {
    if (NEVER_STORE.has(key)) {
      log.warn(
        `${s.key} is in ${ctx.project} and must not be. Not written to ${ctx.path}.`,
      );
      continue;
    }
    remote.set(key, s.value);
  }
  if (remote.size === 0) {
    log.warn(
      `${ctx.project} contains no secrets for ${options.product}/. Writing nothing, because an empty ` +
        `result and a successful pull look identical afterwards. ${FIRST_TIME_HINT}`,
    );
    return;
  }

  const doc = await readDocument(ctx.path);
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
    log.success(`${ctx.path} already matches ${ctx.project}.`);
    return;
  }
  note(changes.join("\n"), `${ctx.path} would change`);
  if (!options.yes) {
    const ok = unwrap(
      await confirm({
        message: `Apply ${changes.length} change(s) to ${ctx.path}?`,
        initialValue: !ctx.guarded,
      }),
    );
    if (!ok) {
      log.warn("Nothing written.");
      process.exitCode = 1;
      return;
    }
  }
  const stamp = stampFor(options.target, "pulled");
  for (const [key, value] of remote) doc.set(key, value, stamp);
  await save(ctx.path, doc);
  log.success(`Updated ${changes.length} value(s) in ${ctx.path}.`);
}

// ── push ─────────────────────────────────────────────────────────────────────

export async function runProductPush(
  options: ProductEnvOptions,
  deps: ProductEnvDeps = realDeps,
): Promise<void> {
  const ctx = context(options);
  if (!ctx) return;
  const doc = await readDocument(ctx.path);
  const { secrets, variables, refused, invalid } = selectProductPush(
    doc.entries(),
    options.product,
  );
  warnRefused(refused, invalid);

  const stored = new Map([...secrets, ...variables]);
  if (stored.size === 0) {
    explain(`No pushable values in ${ctx.path}.`, "", [
      "Empty values are skipped.",
      FIRST_TIME_HINT,
    ]);
    process.exitCode = 1;
    return;
  }

  // Refused before anything is read or written, so a refusal has no side
  // effects. The platform path refuses the same way, but only after planning.
  if (ctx.guarded && options.yes) {
    explain("Refusing to push production non-interactively.", "", [
      "Drop --yes and confirm at the prompt.",
    ]);
    process.exitCode = 1;
    return;
  }

  const projectId = await deps.bws.projectIdFor(ctx.project);
  const index = productSecrets(
    await deps.bws.listSecrets(projectId),
    options.product,
  );
  const created: string[] = [];
  const updated: string[] = [];
  for (const [key, value] of stored) {
    const current = index.get(key);
    if (!current) created.push(key);
    else if (current.value !== value) updated.push(key);
  }
  const orphaned = [...index.keys()].filter((k) => !stored.has(k));

  if (created.length === 0 && updated.length === 0) {
    log.success(`${ctx.project} already matches ${ctx.path}.`);
    if (orphaned.length > 0) {
      log.warn(
        `${orphaned.length} secret(s) exist in the project and not in ` +
          `${ctx.path}: ${orphaned.join(", ")}. They were left alone.`,
      );
    }
  } else {
    note(
      [
        ...created.map((k) => `+ ${k}  (${fingerprint(stored.get(k)!)})`),
        ...updated.map(
          (k) =>
            `~ ${k}  ${fingerprint(index.get(k)!.value)} → ${fingerprint(stored.get(k)!)}`,
        ),
        ...orphaned.map((k) => `? ${k}  only in the project — left alone`),
      ].join("\n"),
      `${ctx.project} will change`,
    );
    if (updated.length > 0 && !options.yes) {
      const ok = unwrap(
        await confirm({
          message: `Overwrite ${updated.length} existing value(s) in ${ctx.project}?`,
          initialValue: false,
        }),
      );
      if (!ok) {
        log.warn("Nothing written.");
        process.exitCode = 1;
        return;
      }
    }
    if (ctx.guarded) {
      const sure = unwrap(
        await confirm({
          message: `This writes to PRODUCTION (${ctx.project} and ${ctx.repo}'s \`${ctx.ghEnvironment}\` environment). Continue?`,
          initialValue: false,
        }),
      );
      if (!sure) {
        log.warn("Nothing written.");
        process.exitCode = 1;
        return;
      }
    }
    for (const key of created) {
      await deps.bws.createSecret(
        projectId,
        `${options.product}/${key}`,
        stored.get(key)!,
        MANAGED,
      );
    }
    for (const key of updated) {
      await deps.bws.updateSecret(index.get(key)!, stored.get(key)!, MANAGED);
    }
    log.success(
      `${ctx.project}: ${created.length} created, ${updated.length} updated.`,
    );
  }

  await pushProductToGithub(ctx, secrets, variables, options, deps);

  const stamp = stampFor(options.target, "pushed");
  for (const [key, value] of stored) doc.set(key, value, stamp);
  await save(ctx.path, doc);
}

async function pushProductToGithub(
  ctx: NonNullable<ReturnType<typeof context>>,
  secrets: Map<string, string>,
  variables: Map<string, string>,
  options: ProductEnvOptions,
  deps: ProductEnvDeps,
): Promise<void> {
  const { repo, ghEnvironment } = ctx;
  let knownSecrets: Set<string>;
  let knownVariables: Set<string>;
  try {
    knownSecrets = new Set(
      (await deps.gh.listSecrets(ghEnvironment, repo)).map((s) => s.name),
    );
    knownVariables = new Set(
      (await deps.gh.listVariables(ghEnvironment, repo)).map((v) => v.name),
    );
  } catch (err) {
    log.error(
      `Could not read the \`${ghEnvironment}\` environment of ${repo}: ` +
        `${err instanceof Error ? err.message.split("\n")[0] : String(err)}. ` +
        "Bitwarden is now ahead of GitHub. Create the environment, then push again.",
    );
    process.exitCode = 1;
    return;
  }
  const fresh =
    [...secrets.keys()].filter((k) => !knownSecrets.has(k)).length +
    [...variables.keys()].filter((k) => !knownVariables.has(k)).length;

  if (!options.yes) {
    const ok = unwrap(
      await confirm({
        message:
          `Sync ${secrets.size} secret(s) and ${variables.size} variable(s) to ` +
          `the \`${ghEnvironment}\` environment of ${repo} (${fresh} new)?`,
        initialValue: !ctx.guarded,
      }),
    );
    if (!ok) {
      log.warn(
        `Skipped \`${ghEnvironment}\`. Bitwarden is now ahead of GitHub; run ` +
          `\`backstage env audit --repo ${options.product} --target ${options.target}\` when you fix it.`,
      );
      process.exitCode = 1;
      return;
    }
  }
  // The two maps stay two maps down to the two calls, as on the platform path:
  // the wrong store for a secret publishes it in plaintext.
  for (const [key, value] of secrets) {
    await deps.gh.setSecret(ghEnvironment, key, value, repo);
  }
  for (const [key, value] of variables) {
    await deps.gh.setVariable(ghEnvironment, key, value, repo);
  }
  log.success(
    `Synced ${secrets.size} secret(s) and ${variables.size} variable(s) to ` +
      `\`${ghEnvironment}\` in ${repo}.`,
  );
}

// ── audit ────────────────────────────────────────────────────────────────────

export async function runProductAudit(
  options: ProductEnvOptions,
  deps: ProductEnvDeps = realDeps,
): Promise<void> {
  const ctx = context(options);
  if (!ctx) return;
  const { repo, ghEnvironment } = ctx;
  const doc = await readDocument(ctx.path);

  const projectId = await deps.bws.projectIdFor(ctx.project);
  const bwsSecrets = [
    ...productSecrets(await deps.bws.listSecrets(projectId), options.product),
  ].map(([key, secret]) => ({ ...secret, key }));

  const github: GithubEntry[] = [];
  const githubVariables: GithubVariableEntry[] = [];
  let unreachable = false;
  try {
    // Both reads complete before either is recorded: half an environment
    // would leave every variable it holds looking like an orphan.
    const secrets = await deps.gh.listSecrets(ghEnvironment, repo);
    const vars = await deps.gh.listVariables(ghEnvironment, repo);
    for (const s of secrets) {
      github.push({
        environment: ghEnvironment,
        name: s.name,
        updatedAt: s.updatedAt,
      });
    }
    for (const v of vars) {
      githubVariables.push({
        environment: ghEnvironment,
        name: v.name,
        value: v.value,
        updatedAt: v.updatedAt,
      });
    }
  } catch {
    unreachable = true;
  }

  let repositoryVariables: RepositoryVariableScan;
  try {
    repositoryVariables = {
      readable: true,
      names: (await deps.gh.listRepositoryVariables(repo)).map((v) => v.name),
    };
  } catch (err) {
    repositoryVariables = {
      readable: false,
      reason:
        (err instanceof Error
          ? err.message.split("\n")[0]?.trim()
          : undefined) ?? "`gh` failed",
    };
  }

  const publicKeys = new Set<string>(PRODUCTS[options.product].variables);
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
    variables: publicKeys,
    // One environment per target. An unreadable one is left out, so "missing
    // from GitHub" is not invented for every key.
    route: () => (unreachable ? null : ghEnvironment),
    routes: () => (unreachable ? [] : [ghEnvironment]),
    accepted: (_key, environment) => environment === ghEnvironment,
    neverStore: NEVER_STORE,
    repositoryVariables,
  });

  note(
    renderFindings(findings),
    `${options.product} ${options.target} (${ctx.path}) — drift`,
  );
  if (unreachable) {
    log.warn(
      `Could not read the \`${ghEnvironment}\` environment of ${repo}, so ` +
        "nothing was checked there. Usually means it does not exist yet.",
    );
  }
  log.info(
    "GitHub *secrets* are write-only: those were checked for presence, " +
      "routing and whether GitHub's copy predates the Bitwarden revision; a " +
      "changed value is undetectable. GitHub *variables* are readable, so " +
      "the public keys were compared by VALUE. Cloudflare is not checked for " +
      "products.",
  );
  if (hasErrors(findings) || unreachable) process.exitCode = 1;
}
