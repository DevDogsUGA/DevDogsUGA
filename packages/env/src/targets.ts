/**
 * The env TARGETS: one row per thing a command can be pointed at.
 *
 *   | `--target`    | File              | Bitwarden project    | `DEPLOY_ENV`? |
 *   |---------------|-------------------|----------------------|---------------|
 *   | `development` | `.env`            | — none               | yes           |
 *   | `preflight`   | `.env.preflight`  | `devdogs-preflight`  | **no**        |
 *   | `staging`     | `.env.staging`    | `devdogs-staging`    | yes           |
 *   | `production`  | `.env.production` | `devdogs-production` | yes           |
 *
 * ⚠️ ONE TABLE, ON PURPOSE. This used to be two enums that overlapped in the
 * middle and diverged at both ends — a `DeployEnvironment`
 * (`development | staging | production`, deciding WHICH FILE) in this package,
 * and a `BwsEnvironment` (`preflight | staging | production`, deciding WHICH
 * VAULT PROJECT) in devtools — behind a single `--env` flag that meant
 * whichever of the two the subcommand happened to import. The result was not a
 * type error anywhere, because the words `staging` and `production` are in
 * both:
 *
 *   * `init --env staging` created `.env.staging`, mapping target → file;
 *   * `push --env staging` read the root `.env`, because its path helper
 *     defaulted there and only honoured an explicit `--file`.
 *
 * So generating `.env.staging`, filling it in, and pushing it uploaded the
 * DEVELOPMENT file to the staging vault project and reported success. In the
 * other direction `MissingEnvFileError` told people to run a pull that wrote
 * staging values into the development `.env` and never created the file the
 * error was about, so the error repeated.
 *
 * Neither subcommand was wrong about its own enum. The fix is therefore not a
 * better check but a smaller vocabulary: one row per target, every per-target
 * fact read from that row, and the two old enums derived as SUBSETS of it
 * (`DeployEnvironment`, `VaultTarget`) rather than maintained beside it. A
 * future subcommand can pick a wrong target; it can no longer pick the wrong
 * vocabulary.
 *
 * Two rows are asymmetric, and both asymmetries are deliberate:
 *
 *   * **`development` has no vault project.** `.env` is one contributor's own
 *     file, and there is no shared "development" set of credentials to sync it
 *     against. `pull`/`push`/`audit` refuse it by name rather than falling
 *     through to some default project.
 *   * **`preflight` is not a deploy environment.** `.env.preflight` is a
 *     staging area for pushing credentials into the preflight vault project;
 *     nothing ever boots from it. See `resolveEnvironment()` below.
 *
 * `.env` IS development rather than a base the others extend, and that is the
 * whole design. A base file plus overlays sounds tidier and fails in one
 * specific way: a variable present in `.env` and forgotten in
 * `.env.production` silently falls through to the development value while
 * `DEPLOY_ENV` says production. Standalone files make that a validation error
 * instead of a wrong answer.
 *
 * There is no `local` alongside `development`. To most people they are
 * synonyms, and a distinction nobody can state is a distinction people get
 * wrong.
 */

export interface TargetSpec {
  /** The env file this target reads and writes. */
  file: string;
  /**
   * Bitwarden Secrets Manager project *name*, or `null` when nothing backs it.
   *
   * A name, not an id. A project id is a UUID that means nothing without a
   * token, so committing one would leak nothing — but it would rot. Ids change
   * when a project is recreated (which is exactly what happens after a botched
   * rotation), and a stale id fails as "project not found" rather than as
   * anything actionable. Resolving by name costs one API call and cannot go
   * stale silently.
   */
  project: string | null;
  /** Whether `DEPLOY_ENV` may name this target — i.e. whether an app boots from it. */
  deployEnv: boolean;
  /** Extra confirmation before writing anywhere on this target's behalf. */
  guarded: boolean;
}

/**
 * Ordered least- to most-dangerous, and the order is load-bearing: it is what
 * the interactive picker lists, so a reflexive Enter never lands on production.
 */
export const TARGETS = {
  development: {
    file: ".env",
    project: null,
    deployEnv: true,
    guarded: false,
  },
  preflight: {
    file: ".env.preflight",
    project: "devdogs-preflight",
    deployEnv: false,
    guarded: false,
  },
  staging: {
    file: ".env.staging",
    project: "devdogs-staging",
    deployEnv: true,
    guarded: false,
  },
  production: {
    file: ".env.production",
    project: "devdogs-production",
    deployEnv: true,
    guarded: true,
  },
} as const satisfies Record<string, TargetSpec>;

type TargetTable = typeof TARGETS;

export type EnvTarget = keyof TargetTable;

/** Targets with a Bitwarden project — the ones `pull`/`push`/`audit` accept. */
export type VaultTarget = {
  [K in EnvTarget]: TargetTable[K]["project"] extends string ? K : never;
}[EnvTarget];

/** Targets `DEPLOY_ENV` may name — the ones `with-env` will load a file for. */
export type DeployEnvironment = {
  [K in EnvTarget]: TargetTable[K]["deployEnv"] extends true ? K : never;
}[EnvTarget];

export const ENV_TARGETS = Object.keys(TARGETS) as readonly EnvTarget[];

export const VAULT_TARGETS = ENV_TARGETS.filter(
  (target): target is VaultTarget => TARGETS[target].project !== null,
);

/**
 * A non-empty tuple type because `z.enum()` requires one, and derived rather
 * than written out because a hand-kept copy is a copy that can disagree with
 * the table. `preflight` is absent here and that is the point — see
 * `resolveEnvironment()`.
 *
 * The emptiness check is real rather than an assertion: an empty list would
 * make `z.enum()` a type error at every app manifest, but only after somebody
 * had already emptied the table, and "no environment is valid" is worth
 * failing on at import.
 */
function deployEnvironments(): readonly [
  DeployEnvironment,
  ...DeployEnvironment[],
] {
  const [first, ...rest] = ENV_TARGETS.filter(
    (target): target is DeployEnvironment => TARGETS[target].deployEnv,
  );
  if (first === undefined) {
    throw new Error("The target table declares no deploy environments.");
  }
  return [first, ...rest];
}

export const DEPLOY_ENVIRONMENTS = deployEnvironments();

export function isEnvTarget(value: string): value is EnvTarget {
  return (ENV_TARGETS as readonly string[]).includes(value);
}

export function isVaultTarget(value: string): value is VaultTarget {
  return (VAULT_TARGETS as readonly string[]).includes(value);
}

export function isDeployEnvironment(value: string): value is DeployEnvironment {
  return (DEPLOY_ENVIRONMENTS as readonly string[]).includes(value);
}

/** The file a target reads and writes. The ONLY place that mapping is made. */
export function fileFor(target: EnvTarget): string {
  return TARGETS[target].file;
}

/** The Bitwarden project backing a target, or `null` for `development`. */
export function projectFor(target: EnvTarget): string | null {
  return TARGETS[target].project;
}

/** Whether writing on this target's behalf needs an extra confirmation. */
export function isGuarded(target: EnvTarget): boolean {
  return TARGETS[target].guarded;
}

/**
 * Whether this target carries ONLY the keys declared `narrowed`, instead of
 * everything a push for it would otherwise route.
 *
 * ⚠️ DERIVED FROM `deployEnv: false`, and that is a rule rather than a
 * coincidence about the one row that has it. A target no app boots from exists
 * for one purpose: to feed CI's plan jobs — migration and schema DRY RUNS —
 * and a plan job is narrow by construction. It reads, it reports, it changes
 * nothing. So there is no credential such a target needs that a deployed one
 * does not, and the moment a row stops being a deploy environment it also stops
 * having any claim on the deployed credential set. A future non-booting target
 * inherits that, correctly, without anyone remembering to say so.
 *
 * A `membership` column saying the same thing was the obvious alternative and
 * is the worse one: it encodes this partition twice, and the two copies can
 * disagree silently in exactly the bad direction — `deployEnv: false` beside a
 * membership of "everything" is a non-booting target holding every
 * production-shaped secret, which is what `preflight` was until this existed.
 * `keysRoutedTo("preflight")` returned all 45 routable keys,
 * `SUPABASE_JWT_SIGNING_KEY` and `GITHUB_APP_PRIVATE_KEY` included, into a
 * project whose GitHub environment is reachable from `main`.
 *
 * The other half — WHICH keys — cannot be derived from this table at all, and
 * lives on the declarations as `EnvMeta.narrowed`.
 */
export function holdsOnlyNarrowedKeys(target: EnvTarget): boolean {
  return !TARGETS[target].deployEnv;
}

export class UnknownEnvironmentError extends Error {
  constructor(readonly value: string) {
    super(
      `DEPLOY_ENV="${value}" is not one of ${DEPLOY_ENVIRONMENTS.join(", ")}.`,
    );
    this.name = "UnknownEnvironmentError";
  }
}

/**
 * Resolves `DEPLOY_ENV` to an environment, refusing anything unrecognised.
 *
 * ⚠️ AN ALLOWLIST, NOT A PARSE, and the difference is not pedantry. Treating
 * the value as a filename suffix means `DEPLOY_ENV=example` loads
 * `.env.example` — which is a real, committed file whose placeholder values
 * pass most of the schema. The app boots, looks configured, and is pointed at
 * nothing.
 *
 * The failure mode of an unrecognised value is worse than "not found" in the
 * other direction too: the old `switchEnvironment()` treated anything that was
 * not `"development"` as deployed, so a stray `DEPLOY_ENV=production-apply`
 * applied the strict schemas while every `=== "production"` gate stayed shut.
 * Configured and wrong, in both directions at once.
 *
 * ⚠️ `DEPLOY_ENV=preflight` IS REFUSED, and that is not an oversight left over
 * from the two-enum era — do not "fix" the inconsistency by adding it. A
 * `preflight` row exists in the table because `.env.preflight` is a staging
 * area for pushing credentials into the preflight vault project: someone runs
 * `env init --target preflight`, fills the file in, and pushes it. Nothing
 * boots from it. The preflight credentials are read-only by construction (a
 * Postgres role that sees only the migrations table, an Airtable PAT with
 * `schema:read`), so an app started against them would fail in a scattered,
 * feature-by-feature way rather than at startup. Refusing here is what keeps
 * that failure at the door.
 */
export function resolveEnvironment(
  value: string | undefined = process.env.DEPLOY_ENV,
): DeployEnvironment {
  if (value === undefined || value === "") return "development";
  if (!isDeployEnvironment(value)) throw new UnknownEnvironmentError(value);
  return value;
}
