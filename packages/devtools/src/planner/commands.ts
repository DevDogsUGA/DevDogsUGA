/**
 * `pnpm devtools planner <status|create|reset-password|drop>` — the operator
 * side of the `migration_planner` role.
 *
 * Four commands because the role has exactly four lifecycle moments:
 *
 *   status          does it exist, can it log in, does it hold the two
 *                   validated grants and nothing that reaches further
 *   create          mint it: role + grants + a generated password, verified
 *                   live, written into .env.preflight
 *   reset-password  new password on the existing role, same verification,
 *                   same write
 *   drop            remove it — the recovery path for a role in a shape
 *                   create refuses to repair, and the retirement path if
 *                   the tier is ever redesigned
 *
 * There is no `retrieve`. A Postgres password is not retrievable — the server
 * holds a hash — and the composed DB_URL's home is `.env.preflight`, synced
 * outward by `env push --target preflight` and back by `env pull`. Losing the
 * local copy is what `pull` is for; losing every copy is what
 * `reset-password` is for. Printing it here would put a live credential in a
 * terminal scrollback for no state the two of those do not already cover.
 *
 * ## Where the admin connection comes from
 *
 * Creating a role needs a privileged connection to the PRODUCTION database —
 * the planner exists so `main` can ask "what would these migrations do to
 * production". That connection is read from `.env.production`'s `DB_URL`
 * (fetch it with `env pull --target production`), or passed as `--db-url` for
 * the bootstrap case where that file is not populated yet. Both paths write to
 * production, so both confirm first: `production` is a guarded target, and a
 * role created by reflex is a credential nobody meant to mint.
 *
 * ## Verified, not merely written
 *
 * `create` and `reset-password` end by opening a SECOND connection as the
 * planner and running the same three checks CI's `deploy require-planner`
 * runs. "The role works and cannot overreach" is observed before the command
 * says done — the same property the security plan records as "validated
 * working", re-established on every mint instead of remembered from one.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { confirm, log, note } from "@clack/prompts";
import { fileFor } from "@devdogsuga/env";
import { fingerprint } from "../fingerprint.js";
import { PROJECT_ROOT } from "../instance.js";
import { bail, unwrap } from "../ui.js";
import { EnvDocument } from "../env/document.js";
import { checkPlanner } from "./checks.js";
import { connectDb, type Connect, type PlannerDb } from "./db.js";
import {
  PLANNER_ROLE,
  createRoleSql,
  generatePassword,
  plannerUrlFrom,
  resetPasswordSql,
} from "./role.js";

/** Constants, like `checks.ts`: `PlannerDb.run` never sees a composed string. */
const QUERY_ROLE = `select rolcanlogin from pg_roles where rolname = '${PLANNER_ROLE}'`;
/**
 * The schema the grants attach to. The Supabase CLI creates it the first time
 * it records migration history on a database — so on a database that has
 * never been CLI-migrated (or baselined with `supabase migration repair`)
 * there is nothing to grant on, and `create` has to say that BEFORE issuing
 * CREATE ROLE, or it strands a grant-less role behind a refusal to re-run.
 */
const QUERY_SCHEMA =
  "select 1 from pg_namespace where nspname = 'supabase_migrations'";
const QUERY_GRANTS =
  `select has_schema_privilege('${PLANNER_ROLE}', 'supabase_migrations', 'usage') as schema_usage, ` +
  `has_table_privilege('${PLANNER_ROLE}', 'supabase_migrations.schema_migrations', 'select') as table_select`;
/**
 * Membership is the quiet way a "narrow" role widens: `grant postgres to
 * migration_planner` leaves both privilege queries above looking correct.
 */
const QUERY_MEMBERSHIPS =
  "select r.rolname from pg_auth_members m " +
  "join pg_roles r on r.oid = m.roleid " +
  "join pg_roles g on g.oid = m.member " +
  `where g.rolname = '${PLANNER_ROLE}' order by r.rolname`;
/**
 * The schemas a dry run has no business seeing. `public` is absent on
 * purpose: PUBLIC-role defaults give every login usage there, so listing it
 * would make this red on a correctly minted role.
 */
const QUERY_OVERREACH =
  "select nspname from pg_namespace " +
  "where nspname in ('platform', 'schedule_builder', 'study_group_finder', 'auth', 'storage') " +
  `and has_schema_privilege('${PLANNER_ROLE}', nspname, 'usage') order by nspname`;

export interface PlannerOptions {
  /** Privileged connection override for the bootstrap case. */
  dbUrl?: string;
  connect?: Connect;
}

function preflightPath(): string {
  return resolve(PROJECT_ROOT, fileFor("preflight"));
}

/**
 * The admin connection string: `--db-url`, else `.env.production`'s `DB_URL`.
 *
 * Read from the FILE rather than `process.env` so that running this under
 * `with-env` (which loads the development `.env`) cannot silently point a
 * CREATE ROLE at the shared dev database — the wrong database succeeding is
 * worse than the right one refusing.
 */
async function adminUrl(options: PlannerOptions): Promise<string> {
  if (options.dbUrl) return options.dbUrl;
  const path = resolve(PROJECT_ROOT, fileFor("production"));
  let doc: EnvDocument;
  try {
    doc = EnvDocument.parse(await readFile(path, "utf8"));
  } catch {
    doc = EnvDocument.empty();
  }
  const url = doc.get("DB_URL");
  if (!url) {
    bail(
      "No DB_URL in .env.production. The planner lives on the production " +
        "database, so this needs its full connection string: run " +
        "`pnpm devtools env pull --target production`, or pass --db-url.",
    );
  }
  return url;
}

async function withDb<T>(
  connect: Connect,
  url: string,
  body: (db: PlannerDb) => Promise<T>,
): Promise<T> {
  const db = connect(url);
  try {
    return await body(db);
  } finally {
    await db.end();
  }
}

async function roleExists(db: PlannerDb): Promise<boolean> {
  return (await db.run(QUERY_ROLE)).length > 0;
}

async function migrationSchemaExists(db: PlannerDb): Promise<boolean> {
  return (await db.run(QUERY_SCHEMA)).length > 0;
}

function bailMissingSchema(): never {
  bail(
    "The supabase_migrations schema does not exist on this database, so " +
      "there is nothing to grant on — and nothing for the §3.5 dry run to " +
      "plan against. The Supabase CLI creates it the first time it records " +
      "migration history here: `supabase db push` on a fresh database, or " +
      "`supabase migration repair` to baseline one that already has its " +
      "objects. Initialize the history first, then re-run this command.",
  );
}

export async function runPlannerStatus(
  options: PlannerOptions = {},
): Promise<void> {
  const connect = options.connect ?? connectDb;
  await withDb(connect, await adminUrl(options), async (db) => {
    // First, because it recolors everything after it: on a database with no
    // migration history, "missing grants" is not the story — this is.
    const schemaReady = await migrationSchemaExists(db);

    const [role] = await db.run(QUERY_ROLE);
    if (!role) {
      log.warn(
        schemaReady
          ? `${PLANNER_ROLE} does not exist. Mint it with \`pnpm devtools planner create\`.`
          : `${PLANNER_ROLE} does not exist — and neither does the ` +
              "supabase_migrations schema, so `planner create` would refuse: " +
              "initialize this database's migration history first " +
              "(`supabase db push`, or `supabase migration repair` to " +
              "baseline an existing database).",
      );
      process.exitCode = 1;
      return;
    }

    const lines = [
      `exists, ${role.rolcanlogin ? "can log in" : "⚠️ CANNOT log in (nologin)"}`,
    ];
    if (!schemaReady) {
      lines.push(
        "⚠️ the supabase_migrations schema DOES NOT EXIST on this database " +
          "— the grants below cannot hold and the dry run cannot plan. " +
          "Initialize the migration history, then `planner reset-password` " +
          "will re-verify (or `planner drop` and re-run `planner create`).",
      );
    }

    // Skipped when the schema is absent: has_schema_privilege raises on a
    // name that does not exist, and the schema line above already carries
    // the diagnosis.
    if (schemaReady) {
      const [grants] = await db.run(QUERY_GRANTS);
      lines.push(
        grants?.schema_usage
          ? "has usage on supabase_migrations"
          : "⚠️ MISSING usage on supabase_migrations",
        grants?.table_select
          ? "has select on supabase_migrations.schema_migrations"
          : "⚠️ MISSING select on supabase_migrations.schema_migrations",
      );
    }

    const memberships = await db.run(QUERY_MEMBERSHIPS);
    lines.push(
      memberships.length === 0
        ? "member of no other role"
        : `⚠️ MEMBER OF: ${memberships.map((m) => String(m.rolname)).join(", ")} — inherited privileges reach past the validated pair`,
    );

    const overreach = await db.run(QUERY_OVERREACH);
    lines.push(
      overreach.length === 0
        ? "no usage on any application schema (platform, schedule_builder, study_group_finder, auth, storage)"
        : `⚠️ CAN REACH: ${overreach.map((s) => String(s.nspname)).join(", ")} — \`planner drop\`, then \`planner create\``,
    );

    const healthy = !lines.some((l) => l.includes("⚠️"));
    note(lines.map((l) => `• ${l}`).join("\n"), PLANNER_ROLE);
    if (!healthy) {
      log.error(
        "The role does not match the validated shape. `planner create` " +
          "refuses to touch an existing role — `planner drop` and re-run " +
          "create, or repair the grants by hand (planner/role.ts holds the " +
          "pair).",
      );
      process.exitCode = 1;
    }
  });
}

/** Shared tail of create and reset-password: verify live, write the file. */
async function verifyAndStore(
  connect: Connect,
  adminDbUrl: string,
  password: string,
): Promise<void> {
  const url = plannerUrlFrom(adminDbUrl, password);

  // The same three checks `deploy require-planner` runs in CI. Observed here,
  // at minting time, so the first workflow run is a repeat rather than a
  // premiere.
  const verdict = await withDb(connect, url, (db) => checkPlanner(db));
  for (const line of verdict.lines) log.info(line);
  if (!verdict.ok) {
    bail(
      `The freshly minted credential failed verification: ${verdict.problem}`,
    );
  }

  const path = preflightPath();
  let doc: EnvDocument;
  try {
    doc = EnvDocument.parse(await readFile(path, "utf8"));
  } catch {
    doc = EnvDocument.empty();
  }
  doc.set("DB_URL", url);
  await writeFile(path, doc.toString());

  log.success(
    `Wrote DB_URL (${fingerprint(url)}) to ${fileFor("preflight")}. ` +
      "Next: `pnpm devtools env push --target preflight`.",
  );
}

export async function runPlannerCreate(
  options: PlannerOptions = {},
): Promise<void> {
  const connect = options.connect ?? connectDb;
  const admin = await adminUrl(options);

  const go = unwrap(
    await confirm({
      message:
        `Create role ${PLANNER_ROLE} on the PRODUCTION database, with its ` +
        "two grants and a generated password?",
      initialValue: false,
    }),
  );
  if (!go) bail();

  await withDb(connect, admin, async (db) => {
    // Before CREATE ROLE, so a database with no migration history refuses
    // cleanly instead of stranding a grant-less role behind the
    // already-exists refusal below — which is exactly what happened the
    // first time this ran against a database the CLI had never migrated.
    if (!(await migrationSchemaExists(db))) bailMissingSchema();

    if (await roleExists(db)) {
      // Refused rather than repaired: an existing role may hold grants this
      // command did not give it, and layering the validated pair on top would
      // report success over an unvalidated whole. `status` shows the shape;
      // `reset-password` rotates the credential without touching grants.
      bail(
        `${PLANNER_ROLE} already exists. Run \`planner status\` to check its ` +
          "shape, `planner reset-password` to rotate it — or, for a " +
          "from-scratch mint, `planner drop` and re-run create.",
      );
    }
    const password = generatePassword();
    // One transaction: the role and its grants exist together or not at all.
    // A mid-flight failure used to leave the role behind with no grants,
    // which the already-exists refusal then protected like a real one.
    await db.run("begin");
    try {
      for (const statement of createRoleSql(password)) {
        await db.run(statement);
      }
      await db.run("commit");
    } catch (error) {
      await db.run("rollback").catch(() => undefined);
      throw error;
    }
    log.success(`Created ${PLANNER_ROLE} with the two validated grants.`);
    await verifyAndStore(connect, admin, password);
  });
}

export async function runPlannerDrop(
  options: PlannerOptions = {},
): Promise<void> {
  const connect = options.connect ?? connectDb;
  const admin = await adminUrl(options);

  const go = unwrap(
    await confirm({
      message:
        `Drop role ${PLANNER_ROLE} from the PRODUCTION database? The ` +
        "preflight credential stops working the moment this runs.",
      initialValue: false,
    }),
  );
  if (!go) bail();

  await withDb(connect, admin, async (db) => {
    if (!(await roleExists(db))) {
      bail(`${PLANNER_ROLE} does not exist — nothing to drop.`);
    }
    // DROP OWNED first, in the same transaction: DROP ROLE alone fails on a
    // role that still holds grants ("some objects depend on it"), and a role
    // being dropped for the WRONG shape — stranded grants, an overreaching
    // grant somebody added by hand — is exactly the one whose grants this
    // command cannot enumerate. The role owns no objects by design, so DROP
    // OWNED only revokes; if somebody ever made it own something, dropping
    // that too is what "drop" has to mean for a from-scratch re-mint.
    await db.run("begin");
    try {
      await db.run(`drop owned by ${PLANNER_ROLE}`);
      await db.run(`drop role ${PLANNER_ROLE}`);
      await db.run("commit");
    } catch (error) {
      await db.run("rollback").catch(() => undefined);
      throw error;
    }
    log.success(`Dropped ${PLANNER_ROLE}.`);
  });

  // The stored credential died with the role; a dead value left in place
  // would push cleanly and audit green, which is this feature's least
  // favorite shape. Blanked, not deleted — a blank line is the file's
  // "fill me in" convention — and only when the value is actually the
  // planner's: a hand-set URL under this key is somebody's deliberate state.
  const path = preflightPath();
  let doc: EnvDocument;
  try {
    doc = EnvDocument.parse(await readFile(path, "utf8"));
  } catch {
    return;
  }
  const stored = doc.get("DB_URL");
  if (stored && stored.includes(PLANNER_ROLE)) {
    doc.set("DB_URL", "");
    await writeFile(path, doc.toString());
    log.info(
      `Blanked the dead DB_URL in ${fileFor("preflight")}. After the next ` +
        "`planner create`, push it with `env push --target preflight`.",
    );
  }
}

export async function runPlannerResetPassword(
  options: PlannerOptions = {},
): Promise<void> {
  const connect = options.connect ?? connectDb;
  const admin = await adminUrl(options);

  const go = unwrap(
    await confirm({
      message:
        `Reset ${PLANNER_ROLE}'s password on the PRODUCTION database? The ` +
        "old connection string stops working the moment this runs.",
      initialValue: false,
    }),
  );
  if (!go) bail();

  await withDb(connect, admin, async (db) => {
    if (!(await roleExists(db))) {
      bail(
        `${PLANNER_ROLE} does not exist — nothing to reset. Mint it with ` +
          "`pnpm devtools planner create`.",
      );
    }
    const password = generatePassword();
    await db.run(resetPasswordSql(password));
    log.success(`Reset ${PLANNER_ROLE}'s password.`);
    await verifyAndStore(connect, admin, password);
  });
}
