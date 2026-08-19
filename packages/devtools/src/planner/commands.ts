/**
 * `pnpm devtools planner <status|create|reset-password>` — the operator side
 * of the `migration_planner` role.
 *
 * Three commands because the role has exactly three lifecycle moments:
 *
 *   status          does it exist, can it log in, does it hold the two
 *                   validated grants and nothing that reaches further
 *   create          mint it: role + grants + a generated password, verified
 *                   live, written into .env.preflight
 *   reset-password  new password on the existing role, same verification,
 *                   same write
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

export async function runPlannerStatus(
  options: PlannerOptions = {},
): Promise<void> {
  const connect = options.connect ?? connectDb;
  await withDb(connect, await adminUrl(options), async (db) => {
    const [role] = await db.run(QUERY_ROLE);
    if (!role) {
      log.warn(
        `${PLANNER_ROLE} does not exist. Mint it with \`pnpm devtools planner create\`.`,
      );
      process.exitCode = 1;
      return;
    }

    const lines = [
      `exists, ${role.rolcanlogin ? "can log in" : "⚠️ CANNOT log in (nologin)"}`,
    ];

    const [grants] = await db.run(QUERY_GRANTS);
    lines.push(
      grants?.schema_usage
        ? "has usage on supabase_migrations"
        : "⚠️ MISSING usage on supabase_migrations",
      grants?.table_select
        ? "has select on supabase_migrations.schema_migrations"
        : "⚠️ MISSING select on supabase_migrations.schema_migrations",
    );

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
        : `⚠️ CAN REACH: ${overreach.map((s) => String(s.nspname)).join(", ")} — drop and re-create the role`,
    );

    const healthy = !lines.some((l) => l.includes("⚠️"));
    note(lines.map((l) => `• ${l}`).join("\n"), PLANNER_ROLE);
    if (!healthy) {
      log.error(
        "The role does not match the validated shape. `planner create` " +
          "refuses to touch an existing role — drop it and re-run create, " +
          "or repair the grants by hand (planner/role.ts holds the pair).",
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
    if (await roleExists(db)) {
      // Refused rather than repaired: an existing role may hold grants this
      // command did not give it, and layering the validated pair on top would
      // report success over an unvalidated whole. `status` shows the shape;
      // `reset-password` rotates the credential without touching grants.
      bail(
        `${PLANNER_ROLE} already exists. Run \`planner status\` to check its ` +
          "shape, `planner reset-password` to rotate it — or drop the role " +
          "and re-run create for a from-scratch mint.",
      );
    }
    const password = generatePassword();
    for (const statement of createRoleSql(password)) {
      await db.run(statement);
    }
    log.success(`Created ${PLANNER_ROLE} with the two validated grants.`);
    await verifyAndStore(connect, admin, password);
  });
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
