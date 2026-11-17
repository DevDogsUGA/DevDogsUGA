/**
 * The product-mode commands: `setup`, `db sync|types|hash`, `dev-data`,
 * `doctor`, `check env-example` and the pinned `supabase`.
 *
 * Each handler is a thin reader of argv over the modules beside this one
 * (`sync.ts`, `types.ts`, `dev-data.ts`, ...), which take their collaborators
 * as parameters. The handlers get the real ones from `defaultDeps`; the tests
 * give them fakes.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { confirm, log, note, password, select, text } from "@clack/prompts";
import { flagValue, positionals } from "@devdogsuga/cli-core/args";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { hasYes, isNonInteractive } from "@devdogsuga/cli-core/mode";
import { bail, unwrap } from "@devdogsuga/cli-core/ui";
import { OAUTH } from "@devdogsuga/sdk/constants";
import { checkFlutterVersion, readFlutterPin } from "../doctor/commands.js";
import { validateSessionPoolerUrl } from "../db/pooler.js";
import { runOAuthSetup } from "../oauth/wizard.js";
import { currentProduct, ProductConfigError, type Product } from "./config.js";
import {
  postgresSession,
  runDevData,
  DevDataError,
  type SqlSession,
} from "./dev-data.js";
import {
  ensureGitignored,
  findSecrets,
  readEnvFile,
  renderEnvFromManifest,
  upsertEnvFile,
} from "./env.js";
import { commandLine, spawnRunner, type Runner } from "./exec.js";
import {
  ensureHostedAuthSettings,
  ManagementError,
  projectRefOf,
} from "./management.js";
import {
  credentialsFromEnv,
  OAuthRegistrationError,
  registerProvider,
  reRegisterSavedProvider,
} from "./oauth.js";
import { generatorFor, schemaHashFor } from "./schema-hash.js";
import {
  cliLine,
  resolveSupabaseCli,
  type SupabaseCli,
} from "./supabase-cli.js";
import {
  dbSync,
  forgetMigrations,
  SyncError,
  type SyncResult,
} from "./sync.js";
import {
  assertNotProduction,
  chooseKind,
  localTarget,
  resolveTarget,
  TargetError,
  TOOLING_KEYS,
  type DbTarget,
  type TargetPreference,
} from "./target.js";
import {
  downloadTypes,
  generateTypes,
  packTypes,
  readTypesState,
  TypesError,
  typesAreCurrent,
} from "./types.js";

export interface ProductDeps {
  run: Runner;
  fetch: typeof fetch;
  openSql: (dbUrl: string) => SqlSession;
  env: NodeJS.ProcessEnv;
  sleep: (ms: number) => Promise<void>;
  /** Whether a person can answer a prompt. */
  interactive: () => boolean;
}

export const defaultDeps: ProductDeps = {
  run: spawnRunner,
  fetch: (input, init) => fetch(input, init),
  openSql: (url) => postgresSession(url),
  env: process.env,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  interactive: () => !isNonInteractive(),
};

type Known =
  | ProductConfigError
  | TargetError
  | SyncError
  | TypesError
  | DevDataError
  | ManagementError
  | OAuthRegistrationError;

function isKnown(err: unknown): err is Known {
  return (
    err instanceof ProductConfigError ||
    err instanceof TargetError ||
    err instanceof SyncError ||
    err instanceof TypesError ||
    err instanceof DevDataError ||
    err instanceof ManagementError ||
    err instanceof OAuthRegistrationError
  );
}

/** Runs a handler body; a known failure prints its message and sets the exit code. */
async function guarded(
  body: () => Promise<string | null>,
): Promise<string | null> {
  try {
    return await body();
  } catch (err) {
    if (!isKnown(err)) throw err;
    log.error(err.message);
    const output = "output" in err ? err.output : undefined;
    if (output) process.stderr.write(`${output.trim()}\n`);
    process.exitCode = 1;
    return null;
  }
}

function requireProduct(): Product {
  const product = currentProduct();
  if (!product) {
    throw new ProductConfigError(
      "No devtools.config.json found in this directory or above it.",
    );
  }
  return product;
}

function preferenceOf(rest: readonly string[]): TargetPreference {
  const local = rest.includes("--local");
  const hosted = rest.includes("--hosted");
  if (local && hosted) {
    throw new TargetError("--local and --hosted are mutually exclusive.");
  }
  return local ? "local" : hosted ? "hosted" : undefined;
}

async function cliFor(
  product: Product,
  deps: ProductDeps,
): Promise<SupabaseCli> {
  return resolveSupabaseCli(
    product.root,
    product.config.supabase.version,
    deps.run,
  );
}

// ── db sync ─────────────────────────────────────────────────────────────────

async function confirmDestructive(
  _sql: string,
  statements: string[],
): Promise<boolean> {
  note(
    statements.join(";\n"),
    "This change drops things in your development database",
  );
  return unwrap(
    await confirm({ message: "Apply it anyway?", initialValue: false }),
  );
}

async function runSync(
  product: Product,
  deps: ProductDeps,
  rest: readonly string[],
): Promise<{ result: SyncResult; cli: SupabaseCli; target: DbTarget | null }> {
  const cli = await cliFor(product, deps);
  const preference = preferenceOf(rest);
  const kind = chooseKind(product, preference);
  const dryRun = isDryRun();

  if (rest.includes("--rebuild")) {
    if (kind !== "local") {
      throw new SyncError(
        "--rebuild resets the database, which devtools only does to the local Docker stack. Reset a hosted project from its dashboard (Database > Settings), then run `devtools db sync`.",
      );
    }
    const tracked = await deps.run(
      "git",
      ["ls-files", "--", `${product.config.supabase.dir}/migrations`],
      { cwd: product.root },
    );
    const committed = tracked.stdout
      .split("\n")
      .filter((file) => file.endsWith(".sql"));
    if (tracked.code === 0 && committed.length > 0) {
      throw new SyncError(
        `${product.config.supabase.dir}/migrations has committed migrations (${committed[0]}, ...); a product keeps its migrations out of git, so --rebuild will not delete them.`,
      );
    }
    if (!hasYes(rest) && deps.interactive()) {
      const ok = unwrap(
        await confirm({
          message:
            "Reset your local database and rebuild it from supabase/schemas? Its data is lost.",
          initialValue: false,
        }),
      );
      if (!ok) bail("Nothing was changed.");
    } else if (!hasYes(rest)) {
      throw new SyncError("--rebuild needs --yes when there is no terminal.");
    }
    if (dryRun) {
      log.info(
        `Would run: ${cliLine(cli, ["db", "reset", "--local", "--yes"])} after removing the local migration record.`,
      );
    } else {
      forgetMigrations(product);
      const reset = await deps.run(
        cli.command,
        [...cli.prefix, "db", "reset", "--local", "--yes"],
        { cwd: product.root, inherit: true },
      );
      if (reset.code !== 0) throw new SyncError("`supabase db reset` failed.");
    }
  }

  const target = dryRun
    ? ({
        kind,
        apiUrl: "",
        dbUrl: "<DB_URL>",
        publishableKey: "",
        secretKey: "",
      } satisfies DbTarget)
    : await resolveTarget(product, cli, deps.run, preference);
  const result = await dbSync(product, cli, target, deps.run, {
    yes: hasYes(rest),
    confirmDestructive: deps.interactive() ? confirmDestructive : undefined,
    dryRun,
    strict: rest.includes("--strict"),
    log: (line) => log.info(line),
    warn: (line) => log.warn(line),
    open: deps.openSql,
  });

  if (rest.includes("--rebuild") && !dryRun) {
    try {
      const row = await reRegisterSavedProvider(
        product.paths.toolingFile,
        target,
      );
      log.success(`Registered ${row.identifier} again.`);
    } catch (err) {
      if (!(err instanceof OAuthRegistrationError)) throw err;
      log.warn(err.message);
    }
  }
  return { result, cli, target: dryRun ? null : target };
}

/**
 * Q82: `db sync` also regenerates the types, so an edit-schema, sync loop never
 * leaves them behind. Skipped when nothing changed and the types on disk are
 * already for this schema. A failure here does not undo the sync.
 */
export async function regenerateAfterSync(
  product: Product,
  cli: SupabaseCli,
  target: DbTarget | null,
  result: SyncResult,
  deps: Pick<ProductDeps, "run">,
): Promise<void> {
  if (target === null) {
    log.info(`Would regenerate ${product.config.types.out}.`);
    return;
  }
  if (!result.applied && typesAreCurrent(product)) return;
  try {
    await generateTypes(product, cli, target, deps.run, (line) =>
      log.info(line),
    );
    log.success(`Regenerated ${product.config.types.out}.`);
  } catch (err) {
    if (!(err instanceof TypesError)) throw err;
    log.warn(
      `${err.message} The sync itself worked; run \`devtools db types\` once that is fixed.`,
    );
  }
}

// ── db types ────────────────────────────────────────────────────────────────

async function runTypes(
  product: Product,
  deps: ProductDeps,
  rest: readonly string[],
): Promise<string> {
  if (isDryRun()) {
    log.info(
      `Would ${rest.includes("--download") ? "download" : "generate"} ${product.config.types.out}.`,
    );
    return DONE;
  }
  if (rest.includes("--download")) {
    const state = await downloadTypes(
      product,
      { fetch: deps.fetch, run: deps.run, token: deps.env["GITHUB_TOKEN"] },
      (line) => log.info(line),
    );
    log.success(
      `Downloaded the types for schema ${state.hash.slice(0, 12)} into ${product.config.types.out}.`,
    );
    return DONE;
  }
  const cli = await cliFor(product, deps);
  const target = await resolveTarget(
    product,
    cli,
    deps.run,
    preferenceOf(rest),
  );
  const state = await generateTypes(product, cli, target, deps.run, (line) =>
    log.info(line),
  );
  log.success(
    `Generated ${product.config.types.out} for schema ${state.hash.slice(0, 12)}.`,
  );
  const pack = flagValue([...rest], "--pack");
  if (pack) {
    await packTypes(product, pack, deps.run);
    log.success(`Packed it into ${pack}.`);
  }
  return DONE;
}

function runHash(product: Product): string {
  // Only the hash on stdout, so CI can capture it; the generator it covers is
  // on stderr for a person.
  process.stdout.write(`${schemaHashFor(product)}\n`);
  process.stderr.write(`generator ${generatorFor(product)}\n`);
  return DONE;
}

// ── handlers ────────────────────────────────────────────────────────────────

export function createProductHandlers(
  deps: ProductDeps = defaultDeps,
): Record<string, CommandHandler> {
  const handleDb: CommandHandler = (rest) =>
    guarded(async () => {
      const product = requireProduct();
      const [sub] = positionals([...rest]);
      const flags = rest.filter((arg) => arg !== sub);
      switch (sub) {
        case "sync": {
          const { result, cli, target } = await runSync(product, deps, flags);
          if (result.applied) {
            log.success(
              result.extras.length > 0
                ? `Your database now matches supabase/schemas, apart from the ${result.extras.length} extra thing${result.extras.length === 1 ? "" : "s"} listed above.`
                : "Your database now matches supabase/schemas.",
            );
          }
          await regenerateAfterSync(product, cli, target, result, deps);
          return DONE;
        }
        case "types":
          return runTypes(product, deps, flags);
        case "hash":
          return runHash(product);
        default:
          throw new ProductConfigError(
            `db: expected sync, types or hash, got ${sub === undefined ? "nothing" : `"${sub}"`}.`,
          );
      }
    });

  const handleDevData: CommandHandler = (rest) =>
    guarded(async () => {
      const product = requireProduct();
      const cli = await cliFor(product, deps);
      const target = await resolveTarget(
        product,
        cli,
        deps.run,
        preferenceOf(rest),
      );
      const done = await runDevData(product, target, deps.openSql, {
        member: flagValue([...rest], "--member"),
        provider: OAUTH.providerId,
        dryRun: isDryRun(),
        log: (line) => log.info(line),
      });
      if (done) {
        log.success(
          `Ran ${done.file} for ${done.member.email ?? done.member.id}.`,
        );
      }
      return DONE;
    });

  const handleCheck: CommandHandler = (rest) =>
    guarded(async () => {
      const product = requireProduct();
      const [sub] = positionals([...rest]);
      if (sub !== "env-example") {
        throw new ProductConfigError(
          `check: expected env-example, got "${sub ?? ""}".`,
        );
      }
      const { envExample } = product.paths;
      if (!existsSync(envExample)) {
        throw new ProductConfigError(
          `${product.config.env.example} does not exist.`,
        );
      }
      const findings = findSecrets(readFileSync(envExample, "utf8"));
      if (findings.length > 0) {
        for (const f of findings) {
          log.error(
            `${product.config.env.example}: ${f.key} — ${f.reason}. This file ships in the app; keep secrets in ${product.config.env.tooling}.`,
          );
        }
        process.exitCode = 1;
        return null;
      }
      log.success(`${product.config.env.example} holds public values only.`);
      return DONE;
    });

  const handleSupabase: CommandHandler = async (rest) => {
    const product = requireProduct();
    const cli = await cliFor(product, deps);
    const args = [...cli.prefix, ...rest];
    if (isDryRun()) {
      log.info(`Would run: ${commandLine(cli.command, args)}`);
      return DONE;
    }
    const result = await deps.run(cli.command, args, {
      cwd: product.root,
      inherit: true,
    });
    if (result.code !== 0) process.exitCode = result.code;
    return result.code === 0 ? DONE : null;
  };

  const handleDoctor: CommandHandler = (rest) =>
    guarded(async () => {
      void rest;
      const product = requireProduct();
      return runDoctor(product, deps);
    });

  const handleSetup: CommandHandler = (rest) =>
    guarded(async () => runSetup(requireProduct(), deps, rest));

  return {
    setup: handleSetup,
    db: handleDb,
    "dev-data": handleDevData,
    doctor: handleDoctor,
    check: handleCheck,
    supabase: handleSupabase,
  };
}

// ── doctor ──────────────────────────────────────────────────────────────────

async function runDoctor(product: Product, deps: ProductDeps): Promise<string> {
  const lines: string[] = [];
  const ok = (message: string): void => void lines.push(`OK    ${message}`);
  const warn = (message: string): void => void lines.push(`WARN  ${message}`);
  const info = (message: string): void => void lines.push(`INFO  ${message}`);

  ok(
    `${product.config.name} (${product.config.product}), Supabase CLI pinned at ${product.config.supabase.version}`,
  );

  const cli = await cliFor(product, deps);
  if (cli.source === "pnpm" || cli.source === "npx") {
    info(
      `The pinned Supabase CLI is fetched with ${cli.command} on first use (${cliLine(cli, ["--version"])}).`,
    );
  } else {
    ok(`Supabase CLI ${product.config.supabase.version} (${cli.source})`);
  }

  const docker = await deps
    .run("docker", ["info", "--format", "{{.ServerVersion}}"], {
      cwd: product.root,
    })
    .catch(() => ({ code: 1, stdout: "", stderr: "" }));
  if (docker.code === 0) ok(`Docker ${docker.stdout.trim()}`);
  else
    warn(
      "Docker is not reachable. The local stack and the schema diff need it.",
    );

  const flutterPin = readFlutterPin(product.root);
  if (flutterPin) {
    const flutter = await deps
      .run("flutter", ["--version", "--machine"], { cwd: product.root })
      .catch(() => ({ code: 1, stdout: "", stderr: "" }));
    const check = checkFlutterVersion(
      flutter.code === 0 ? flutter.stdout : null,
      flutterPin,
    );
    if (check.status === "ok") ok(check.summary);
    else warn(`${check.summary}\n      fix: ${check.fix}`);
  }

  if (product.config.types.kind === "supadart") {
    const dart = await deps
      .run("dart", ["--version"], { cwd: product.root })
      .catch(() => ({ code: 1, stdout: "", stderr: "" }));
    if (dart.code === 0) ok("Dart on PATH");
    else warn("Dart is not on PATH; `db types` needs it for supadart.");
  }

  const pub = readEnvFile(product.paths.envFile);
  const missing = Object.values(product.config.env.keys).filter(
    (key) => !pub[key],
  );
  if (!existsSync(product.paths.envFile)) {
    warn(`${product.config.env.file} does not exist. Run \`devtools setup\`.`);
  } else if (missing.length > 0) {
    warn(`${product.config.env.file} is missing ${missing.join(", ")}.`);
  } else {
    ok(`${product.config.env.file} has the project URL and publishable key`);
  }

  const findings = existsSync(product.paths.envExample)
    ? findSecrets(readFileSync(product.paths.envExample, "utf8"))
    : [];
  if (findings.length > 0) {
    warn(
      `${product.config.env.example} has secret-looking keys: ${findings.map((f) => f.key).join(", ")}.`,
    );
  }

  const kind = chooseKind(product, undefined);
  info(
    `Target: ${kind === "hosted" ? "your own hosted project" : "the local Docker stack"}`,
  );
  try {
    const target = await resolveTarget(product, cli, deps.run, undefined);
    ok(`Database reachable at ${target.apiUrl}`);
  } catch (err) {
    if (!(err instanceof TargetError)) throw err;
    warn(err.message);
  }

  if (existsSync(product.paths.schemasDir)) {
    if (typesAreCurrent(product)) {
      ok(
        `Generated types match the schema (${readTypesState(product)?.source ?? "?"})`,
      );
    } else {
      warn(
        `${product.config.types.out} is missing or older than supabase/schemas. Run \`devtools db types\` (or \`--download\`).`,
      );
    }
  }

  note(lines.join("\n"), `${product.config.name} environment`);
  return DONE;
}

// ── setup ───────────────────────────────────────────────────────────────────

async function chooseSetupKind(
  deps: ProductDeps,
  preference: TargetPreference,
): Promise<"local" | "hosted"> {
  if (preference) return preference;
  if (!deps.interactive()) return "local";
  return unwrap(
    await select({
      message: "Which Supabase should this checkout use?",
      options: [
        {
          value: "local" as const,
          label: "Local (Docker)",
          hint: "needs Docker; nothing to create online",
        },
        {
          value: "hosted" as const,
          label: "Your own free Supabase project",
          hint: "create one at supabase.com first",
        },
      ],
      initialValue: "local" as const,
    }),
  );
}

async function promptHosted(
  product: Product,
  deps: ProductDeps,
): Promise<DbTarget> {
  const tooling = readEnvFile(product.paths.toolingFile);
  const pub = readEnvFile(product.paths.envFile);
  const { keys } = product.config.env;
  const fromEnv = (name: string): string | undefined => {
    const value = deps.env[name];
    return value === "" ? undefined : value;
  };
  const have = {
    apiUrl: fromEnv("DEVTOOLS_SUPABASE_URL") ?? pub[keys.url],
    publishableKey:
      fromEnv("DEVTOOLS_SUPABASE_PUBLISHABLE_KEY") ?? pub[keys.publishableKey],
    secretKey:
      fromEnv("DEVTOOLS_SUPABASE_SECRET_KEY") ??
      tooling[TOOLING_KEYS.secretKey],
    dbUrl: fromEnv("DEVTOOLS_DB_URL") ?? tooling[TOOLING_KEYS.dbUrl],
  };
  const complete =
    have.apiUrl && have.publishableKey && have.secretKey && have.dbUrl;
  if (!complete && !deps.interactive()) {
    throw new TargetError(
      "A hosted setup with no terminal needs DEVTOOLS_SUPABASE_URL, DEVTOOLS_SUPABASE_PUBLISHABLE_KEY, DEVTOOLS_SUPABASE_SECRET_KEY and DEVTOOLS_DB_URL in the environment.",
    );
  }
  if (!complete) {
    note(
      [
        "1. Create a free project at https://supabase.com/dashboard",
        "2. Project Settings > API: copy the Project URL, the publishable key and the secret key.",
        "3. Project Settings > Database > Connection string > Session pooler: copy that string (port 5432, not 6543).",
      ].join("\n"),
      "Your own Supabase project",
    );
  }
  const ask = async (
    label: string,
    current: string | undefined,
    secret: boolean,
  ): Promise<string> => {
    if (current) return current;
    const validate = (v: string | undefined): string | undefined =>
      v?.trim() ? undefined : "Required";
    return unwrap(
      secret
        ? await password({ message: label, validate })
        : await text({ message: label, validate }),
    ).trim();
  };
  const apiUrl = (await ask("Project URL", have.apiUrl, false)).replace(
    /\/+$/,
    "",
  );
  const publishableKey = await ask(
    "Publishable key",
    have.publishableKey,
    false,
  );
  const secretKey = await ask("Secret key", have.secretKey, true);
  let dbUrl = have.dbUrl;
  for (;;) {
    dbUrl = await ask("Session pooler connection string", dbUrl, true);
    const validation = validateSessionPoolerUrl(dbUrl);
    if (validation.ok) break;
    if (!deps.interactive())
      throw new TargetError(validation.message ?? "That DB_URL is not usable.");
    log.error(validation.message ?? "That DB_URL is not usable.");
    dbUrl = undefined;
  }
  assertNotProduction(product, apiUrl, dbUrl);
  return { kind: "hosted", apiUrl, dbUrl, publishableKey, secretKey };
}

async function runSetup(
  product: Product,
  deps: ProductDeps,
  rest: readonly string[],
): Promise<string> {
  const { config } = product;
  const dryRun = isDryRun();
  log.info(`Setting up ${config.name}.`);

  // 1. The public .env, from the manifest.
  if (!existsSync(product.paths.envExample)) {
    throw new ProductConfigError(
      `${config.env.example} does not exist; it is the manifest .env is made from.`,
    );
  }
  const manifest = readFileSync(product.paths.envExample, "utf8");
  const secrets = findSecrets(manifest);
  if (secrets.length > 0) {
    throw new ProductConfigError(
      `${config.env.example} has secret-looking keys (${secrets.map((s) => s.key).join(", ")}); it ships in the app. Move them to ${config.env.tooling} first.`,
    );
  }
  if (dryRun) {
    log.info(
      `Would write ${config.env.file} from ${config.env.example}, start the database, sync the schema, get the types and set up sign in.`,
    );
    return DONE;
  }
  if (!existsSync(product.paths.envFile)) {
    writeFileSync(product.paths.envFile, renderEnvFromManifest(manifest, {}));
    log.success(`Created ${config.env.file} from ${config.env.example}.`);
  }

  // Both files hold values that must stay out of version control: `.env` is
  // per-machine, `.env.tooling` carries the database URL and the secret keys.
  for (const file of [config.env.file, config.env.tooling]) {
    if (ensureGitignored(product.root, file)) {
      log.warn(
        `${file} was not ignored by version control; added /${file} to the ignore file.`,
      );
    }
  }

  // 2. The database.
  const cli = await cliFor(product, deps);
  const kind = await chooseSetupKind(deps, preferenceOf(rest));
  let target: DbTarget;
  if (kind === "local") {
    log.info(
      "Starting the local Supabase stack (the first start downloads its images).",
    );
    // `--ignore-health-check`: the API exposes the product's own schema, which
    // does not exist until the first `db sync`, so PostgREST is unhealthy on a
    // fresh database. It reconnects by itself once the schema is there, and
    // `waitForRest` below checks that it did.
    const started = await deps.run(
      cli.command,
      [...cli.prefix, "start", "--ignore-health-check"],
      { cwd: product.root, inherit: true },
    );
    if (started.code !== 0) {
      throw new TargetError("`supabase start` failed. Is Docker running?");
    }
    target = await localTarget(product, cli, deps.run);
    upsertEnvFile(
      product.paths.toolingFile,
      { [TOOLING_KEYS.target]: "local" },
      "# Secrets for devtools. Never committed.",
    );
  } else {
    target = await promptHosted(product, deps);
    upsertEnvFile(
      product.paths.toolingFile,
      {
        [TOOLING_KEYS.target]: "hosted",
        [TOOLING_KEYS.dbUrl]: target.dbUrl,
        [TOOLING_KEYS.secretKey]: target.secretKey,
      },
      "# Secrets for devtools. Never committed.",
    );
  }
  upsertEnvFile(product.paths.envFile, {
    [config.env.keys.url]: target.apiUrl,
    [config.env.keys.publishableKey]: target.publishableKey,
  });
  log.success(`${config.env.file} points at ${target.apiUrl}.`);

  // 3. The schema.
  const result = await dbSync(product, cli, target, deps.run, {
    yes: hasYes(rest),
    confirmDestructive: deps.interactive() ? confirmDestructive : undefined,
    log: (line) => log.info(line),
    warn: (line) => log.warn(line),
    open: deps.openSql,
  });
  if (result.applied) {
    log.success("Applied supabase/schemas to your database.");
  } else if (result.compared) {
    log.success("Your database already matched supabase/schemas.");
  }

  if (target.kind === "local") await waitForRest(target, deps, product);

  // 4. The types.
  if (rest.includes("--download-types")) {
    try {
      await downloadTypes(
        product,
        { fetch: deps.fetch, run: deps.run, token: deps.env["GITHUB_TOKEN"] },
        (l) => log.info(l),
      );
      log.success("Downloaded the generated types.");
    } catch (err) {
      if (!(err instanceof TypesError)) throw err;
      log.warn(`${err.message} Generating them from your database instead.`);
      await generateTypes(product, cli, target, deps.run, (l) => log.info(l));
    }
  } else {
    await generateTypes(product, cli, target, deps.run, (l) => log.info(l));
    log.success(`Generated ${config.types.out}.`);
  }

  // 5. Sign in with DevDogs.
  await setUpSignIn(product, deps, target, rest);

  note(
    [
      config.runHint ?? "Start the app, then sign in with DevDogs.",
      "",
      "Check the whole setup any time with `devtools doctor`.",
    ].join("\n"),
    "Next",
  );
  return DONE;
}

/**
 * Waits for the API to serve the product's schema: PostgREST starts unhealthy
 * on an empty database and loads its schema cache on its next reconnect.
 */
async function waitForRest(
  target: DbTarget,
  deps: ProductDeps,
  product: Product,
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await deps.fetch(`${target.apiUrl}/rest/v1/`, {
        headers: {
          apikey: target.publishableKey,
          "accept-profile": product.config.supabase.schemas[0] ?? "public",
        },
      });
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await deps.sleep(2000);
  }
  log.warn(
    "The local API is not serving your schema yet. `devtools doctor` and `supabase status` will say more.",
  );
}

async function setUpSignIn(
  product: Product,
  deps: ProductDeps,
  target: DbTarget,
  rest: readonly string[],
): Promise<void> {
  if (rest.includes("--skip-oauth")) {
    log.info(
      'Skipped "Sign in with DevDogs" (--skip-oauth). Run `devtools oauth` when you want it.',
    );
    return;
  }

  if (target.kind === "hosted") {
    const ref = projectRefOf(target.apiUrl);
    const token =
      deps.env["SUPABASE_ACCESS_TOKEN"] ??
      readEnvFile(product.paths.toolingFile)[TOOLING_KEYS.accessToken];
    if (ref && token) {
      const { changed } = await ensureHostedAuthSettings({
        projectRef: ref,
        token,
        redirectUris: product.config.oauth.redirectUris,
        fetch: deps.fetch,
      });
      if (changed.length > 0)
        log.success(
          `Updated your project's auth settings: ${changed.join(", ")}.`,
        );
    } else {
      note(
        [
          "Two settings on your project, in the dashboard:",
          "  Authentication > Providers: turn on custom OAuth/OIDC providers.",
          ...(product.config.oauth.redirectUris.length > 0
            ? [
                `  Authentication > URL Configuration > Redirect URLs: add ${product.config.oauth.redirectUris.join(", ")}`,
              ]
            : []),
          "Or put a personal access token in SUPABASE_ACCESS_TOKEN and run setup again.",
        ].join("\n"),
        "Before sign in will work",
      );
    }
  } else {
    const configToml = join(product.paths.supabaseDir, "config.toml");
    const text = existsSync(configToml) ? readFileSync(configToml, "utf8") : "";
    const missing = product.config.oauth.redirectUris.filter(
      (uri) => !text.includes(uri),
    );
    if (missing.length > 0) {
      log.warn(
        `Allow ${missing.join(", ")} under [auth] additional_redirect_urls in ${product.config.supabase.dir}/config.toml, or sign in will be refused on this stack.`,
      );
    }
  }

  process.chdir(product.root);
  const credentials = credentialsFromEnv(deps.env);
  if (credentials) {
    const row = await registerProvider(
      product.paths.toolingFile,
      target,
      credentials,
    );
    log.success(`Registered ${row.identifier} from DEVDOGS_OAUTH_CLIENT_ID.`);
    return;
  }
  if (!deps.interactive()) {
    log.warn(
      'No terminal, so "Sign in with DevDogs" was not set up. Set DEVDOGS_OAUTH_CLIENT_ID and DEVDOGS_OAUTH_CLIENT_SECRET, or run `devtools oauth`.',
    );
    return;
  }
  await runOAuthSetup(
    undefined,
    undefined,
    undefined,
    {
      kind: target.kind,
      apiUrl: target.apiUrl,
      serviceRoleKey: target.secretKey,
    },
    product.config.env.tooling,
  );
}
