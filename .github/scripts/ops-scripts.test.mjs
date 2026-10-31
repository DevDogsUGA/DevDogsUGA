import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkRoutes, overlaps, parseJsonc } from "./check-routes.mjs";
import {
  discoverIssuer,
  envRefs,
  lookupFrom,
  pushConfig,
  registerProvider,
  resolveConfig,
} from "./config-push.mjs";
import {
  changedMigrations,
  checkPlannerCredential,
  classifyPendingMigrations,
  classifyPendingSeeds,
  commandOutput,
  schemaApplySegments,
  dbPort,
  withEngineDrops,
  main as dbPlanMain,
  managedSchemas,
  normalizeSql,
  parseDiffJson,
  parsePushJson,
  planHash,
  renderSchemaPlan,
  redactUrls,
  rewriteConfig,
} from "./db-plan.mjs";
import {
  evaluateGate,
  evaluateNeed,
  labelState,
  pullFromQueueRef,
} from "./destructive-label.mjs";
import { evaluateSuperseded, matchingPaths } from "./superseded.mjs";
import { q39Checks } from "./q39-checks.mjs";
import {
  classifySql,
  splitRawStatements,
  splitStatements,
} from "./sql-classify.mjs";
import {
  overrideHeader,
  runSmoke,
  sweepStaleClients,
} from "./worker-smoke.mjs";
import { activeVersion, lastUpload } from "./wrangler-version.mjs";

/* ---------- sql-classify ---------- */

const kinds = (sql) => classifySql(sql).reasons.map((r) => r.kind);

test("additive SQL is not destructive", () => {
  assert.deepEqual(
    kinds(`
      CREATE TABLE a (id int);
      ALTER TABLE a ADD COLUMN type text;
      ALTER TABLE a ADD CONSTRAINT k UNIQUE (id);
      CREATE INDEX i ON a (id);
      GRANT SELECT ON a TO anon;
      DROP INDEX old_i;
      DROP TRIGGER t ON a;
      ALTER TABLE a DROP CONSTRAINT k;
      ALTER TABLE a ALTER COLUMN id SET NOT NULL;
      ALTER TABLE a ALTER COLUMN id DROP NOT NULL;
      INSERT INTO a VALUES (1);
      COMMENT ON TABLE a IS 'drop table a';
    `),
    [],
  );
});

test("drops, type changes, renames, truncates and data moves are destructive", () => {
  assert.deepEqual(kinds("DROP TABLE x;"), ["DROP TABLE"]);
  assert.deepEqual(kinds("DROP TABLE IF EXISTS x CASCADE;"), ["DROP TABLE"]);
  assert.deepEqual(kinds("DROP SCHEMA s CASCADE;"), ["DROP SCHEMA"]);
  assert.deepEqual(kinds("ALTER TABLE a DROP COLUMN c;"), ["DROP COLUMN"]);
  assert.deepEqual(kinds("ALTER TABLE a DROP COLUMN IF EXISTS c;"), [
    "DROP COLUMN",
  ]);
  assert.deepEqual(kinds("ALTER TABLE a ALTER COLUMN c TYPE bigint;"), [
    "ALTER COLUMN TYPE",
  ]);
  assert.deepEqual(
    kinds('ALTER TABLE ONLY "p"."a" ALTER COLUMN "c" SET DATA TYPE text;'),
    ["ALTER COLUMN TYPE"],
  );
  assert.deepEqual(kinds("ALTER TABLE a RENAME COLUMN b TO c;"), ["RENAME"]);
  assert.deepEqual(kinds("ALTER TABLE a RENAME TO b;"), ["RENAME"]);
  assert.deepEqual(kinds("TRUNCATE a;"), ["TRUNCATE"]);
  assert.deepEqual(kinds("DELETE FROM a WHERE x = 1;"), ["DELETE"]);
  assert.deepEqual(kinds("UPDATE a SET b = 1;"), ["UPDATE"]);
  assert.deepEqual(kinds("DO $$ begin null; end $$;"), ["DO block"]);
});

test("a constraint rename is not a loss", () => {
  assert.deepEqual(kinds("ALTER TABLE a RENAME CONSTRAINT k TO j;"), []);
});

test("a policy, function or view that is re-created is not a loss; one that vanishes is", () => {
  assert.deepEqual(
    kinds(
      'DROP POLICY p ON "s"."t"; CREATE POLICY p ON "s"."t" FOR SELECT USING (true);',
    ),
    [],
  );
  assert.deepEqual(kinds('DROP POLICY p ON "s"."t";'), ["DROP POLICY"]);
  assert.deepEqual(
    kinds(
      'DROP POLICY p ON "s"."t"; CREATE POLICY p ON "s"."other" FOR SELECT USING (true);',
    ),
    ["DROP POLICY"],
  );
  assert.deepEqual(
    kinds(
      "DROP FUNCTION s.f(int); CREATE FUNCTION s.f(text) RETURNS int AS $$ select 1 $$ LANGUAGE sql;",
    ),
    [],
  );
  assert.deepEqual(kinds("DROP FUNCTION s.f(int);"), ["DROP FUNCTION"]);
  assert.deepEqual(kinds("DROP VIEW s.v;"), ["DROP VIEW"]);
  assert.deepEqual(
    kinds(
      "DROP MATERIALIZED VIEW s.v; CREATE MATERIALIZED VIEW s.v AS select 1;",
    ),
    [],
  );
});

test("SQL in comments, strings and function bodies is not mistaken for statements", () => {
  assert.deepEqual(
    kinds(`
      -- DROP TABLE a;
      /* DROP TABLE b; /* nested */ DROP TABLE c; */
      INSERT INTO log VALUES ('DROP TABLE d; DELETE FROM e');
      CREATE FUNCTION f() RETURNS void AS $body$
        begin delete from x; drop table y; end
      $body$ LANGUAGE plpgsql;
    `),
    [],
  );
});

test("splitStatements keeps quoted identifiers and drops comments", () => {
  assert.deepEqual(splitStatements('SELECT "a;b" -- tail\n; SELECT 2;'), [
    'SELECT "a;b"',
    "SELECT 2",
  ]);
});

test("destructive forms hand-written migrations use are caught, not just the textbook ones", () => {
  // COLUMN is optional in ALTER TABLE ... DROP.
  assert.deepEqual(kinds('ALTER TABLE "platform"."users" DROP "email";'), [
    "DROP COLUMN",
  ]);
  assert.deepEqual(kinds("ALTER TABLE a ADD COLUMN x int, DROP y;"), [
    "DROP COLUMN",
  ]);
  assert.deepEqual(kinds("ALTER TABLE ONLY a DROP COLUMN IF EXISTS b;"), [
    "DROP COLUMN",
  ]);
  // ...but the DROP forms that are not column drops stay quiet.
  assert.deepEqual(
    kinds(
      "ALTER TABLE a DROP CONSTRAINT c, ALTER COLUMN b DROP DEFAULT, ALTER COLUMN d DROP NOT NULL, ALTER COLUMN e DROP IDENTITY;",
    ),
    [],
  );
  // CASCADE drops the dependents too, even when the object is re-created.
  assert.deepEqual(kinds("DROP TYPE t CASCADE; CREATE TYPE t AS ENUM ('a');"), [
    "DROP TYPE CASCADE",
  ]);
  assert.deepEqual(kinds("DROP TYPE t; CREATE TYPE t AS ENUM ('a');"), []);
  // Data-modifying CTEs, MERGE that deletes or updates, DROP OWNED, CALL.
  assert.deepEqual(kinds("WITH d AS (DELETE FROM a RETURNING *) SELECT 1;"), [
    "DELETE or UPDATE in a WITH query",
  ]);
  assert.deepEqual(
    kinds("WITH d AS (UPDATE a SET x = 1 RETURNING *) SELECT 1;"),
    ["DELETE or UPDATE in a WITH query"],
  );
  assert.deepEqual(kinds("WITH d AS (SELECT 1) SELECT * FROM d;"), []);
  assert.deepEqual(
    kinds("MERGE INTO a USING b ON a.i = b.i WHEN MATCHED THEN DELETE;"),
    ["MERGE"],
  );
  assert.deepEqual(
    kinds(
      "MERGE INTO a USING b ON a.i = b.i WHEN NOT MATCHED THEN INSERT VALUES (1);",
    ),
    [],
  );
  assert.deepEqual(kinds("DROP OWNED BY r;"), ["DROP OWNED"]);
  assert.deepEqual(kinds("CALL migrate_everything();"), ["CALL"]);
  assert.deepEqual(kinds("ALTER TYPE t DROP ATTRIBUTE a;"), ["DROP ATTRIBUTE"]);
});

test("the diff engine's own drop statements make a plan destructive", () => {
  const clean = classifySql("ALTER TABLE a ADD COLUMN b int;");
  assert.equal(withEngineDrops(clean, []).destructive, false);
  const flagged = withEngineDrops(clean, ["DROP SCHEMA  s"]);
  assert.equal(flagged.destructive, true);
  assert.deepEqual(
    flagged.reasons.map((r) => [r.kind, r.statement]),
    [["DROP (diff engine)", "DROP SCHEMA s"]],
  );
  // A drop the classifier already reported is not listed twice.
  const dropped = classifySql("DROP TABLE a;");
  assert.equal(withEngineDrops(dropped, ["DROP TABLE a"]).reasons.length, 1);
});

/* ---------- db-plan ---------- */

test("the plan hash ignores line endings and trailing whitespace, and nothing else", () => {
  assert.equal(
    planHash("ALTER TABLE a ADD COLUMN b int;\r\n"),
    planHash("ALTER TABLE a ADD COLUMN b int;  \n\n"),
  );
  assert.notEqual(
    planHash("ALTER TABLE a ADD COLUMN b int;"),
    planHash("ALTER TABLE a ADD COLUMN c int;"),
  );
  assert.equal(planHash("  \n"), "empty");
  assert.equal(normalizeSql("a  \r\nb\n\n\n"), "a\nb\n");
});

test("managedSchemas lists the schema directories and skips _cluster", () => {
  const dir = mkdtempSync(join(tmpdir(), "schemas-"));
  for (const name of ["_cluster", "platform", "storage"])
    mkdirSync(join(dir, name));
  writeFileSync(join(dir, "stray.sql"), "");
  assert.deepEqual(managedSchemas(dir), ["platform", "storage"]);
  assert.deepEqual(managedSchemas(join(dir, "missing")), []);
});

test("rewriteConfig isolates the scratch stack", () => {
  const toml = [
    'project_id = "Real"',
    "[api]",
    "port = 54321",
    "[db]",
    "port = 54322",
    "shadow_port = 54320",
    "[db.seed]",
    "# a comment",
    "enabled = true",
    'sql_paths = ["./seed/*.sql"]',
    "[auth]",
    "enabled = true",
  ].join("\n");
  const out = rewriteConfig(toml, { projectId: "scratch1", portBase: 60000 });
  assert.match(out, /project_id = "scratch1"/);
  assert.doesNotMatch(out, /5432[0-9]/);
  assert.equal(dbPort(out), 60002);
  assert.match(out, /\[db\.seed\][^[]*enabled = false/);
  assert.match(out, /\[auth\]\nenabled = true/);
});

test("parsePushJson and parseDiffJson read the CLI's JSON through log noise", () => {
  const push = parsePushJson(
    `Initialising login role...\n${JSON.stringify({ upToDate: false, migrations: ["20261201000000_x.sql"], seeds: ["seed/a.sql"], roles: [] })}\nnoise`,
  );
  assert.deepEqual(push.migrations, ["20261201000000_x.sql"]);
  assert.deepEqual(push.seeds, ["seed/a.sql"]);
  assert.throws(() => parsePushJson("no json here"), /no JSON/);
  const diff = parseDiffJson(
    `log\n${JSON.stringify({ diff: "SELECT 1;", dropStatements: ["DROP TABLE a"] })}\n`,
  );
  assert.equal(diff.diff, "SELECT 1;");
  assert.deepEqual(diff.dropStatements, ["DROP TABLE a"]);
  assert.throws(() => parseDiffJson('{"message":"x"}'), /no diff text/);
});

test("pending hand-written migrations are read and classified", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(
    join(root, "supabase", "migrations", "20261201000000_drop.sql"),
    "ALTER TABLE a DROP COLUMN b;",
  );
  writeFileSync(
    join(root, "supabase", "migrations", "20261202000000_add.sql"),
    "ALTER TABLE a ADD COLUMN b int;",
  );
  const out = classifyPendingMigrations(root, [
    "20261201000000_drop.sql",
    "20261202000000_add.sql",
  ]);
  assert.deepEqual(
    out.map((o) => [o.file, o.destructive]),
    [
      ["20261201000000_drop.sql", true],
      ["20261202000000_add.sql", false],
    ],
  );
});

test("the schema plan summary carries the hash, the verdict and the SQL", () => {
  const sql = "ALTER TABLE a DROP COLUMN b;\n";
  const text = renderSchemaPlan({
    title: "Schema change",
    sql,
    hash: planHash(sql),
    classification: classifySql(sql),
    schemas: ["platform"],
  });
  assert.match(text, /Plan hash: `[0-9a-f]{64}`/);
  assert.match(text, /Destructive: 1 statement/);
  assert.match(text, /DROP COLUMN/);
  assert.match(
    renderSchemaPlan({
      title: "t",
      sql: "",
      hash: "empty",
      classification: classifySql(""),
    }),
    /nothing to apply/,
  );
});

/** A fake CLI: `db diff` answers `diff`, `db push` answers the dry-run JSON. */
function fakeRuntime({ diff = "", push, env }) {
  const calls = [];
  const rt = {
    cli: "supabase",
    env: { PLAN_DIR: mkdtempSync(join(tmpdir(), "plan-")), ...env },
    calls,
    log: () => {},
    run(cmd, args) {
      calls.push([cmd, ...args]);
      if (args[0] === "db" && args[1] === "diff") {
        return {
          status: 0,
          stdout: JSON.stringify({ diff, dropStatements: [] }),
          stderr: "",
        };
      }
      if (
        args[0] === "db" &&
        args[1] === "push" &&
        args.includes("--dry-run")
      ) {
        return {
          status: 0,
          stdout: JSON.stringify(
            push ?? { upToDate: true, migrations: [], seeds: [], roles: [] },
          ),
          stderr: "",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  };
  return rt;
}

test("planner-check accepts only the read-only migration_planner role", () => {
  const answering = (stdout, status = 0, stderr = "") => ({
    env: { DB_URL: "postgres://u:pw@h/db", PLAN_DIR: join(tmpdir(), "p") },
    log: () => {},
    run: () => ({ status, stdout, stderr }),
  });
  const verdict = (rt) =>
    checkPlannerCredential(rt, { url: "postgres://u:pw@h/db" });
  assert.equal(verdict(answering("migration_planner|false\n")).ok, true);
  const admin = verdict(answering("postgres|true\n"));
  assert.equal(admin.ok, false);
  assert.match(admin.detail, /not migration_planner/);
  const overreach = verdict(answering("migration_planner|true\n"));
  assert.equal(overreach.ok, false);
  assert.match(overreach.detail, /can read platform\.profile/);
  const down = verdict(
    answering("", 2, "psql: connection to postgres://u:secret@h/db failed"),
  );
  assert.equal(down.ok, false);
  assert.doesNotMatch(down.detail, /secret/);

  const rt = answering("postgres|false\n");
  assert.equal(dbPlanMain(["planner-check"], rt), 1);
  const good = answering("migration_planner|false\n");
  assert.equal(dbPlanMain(["planner-check"], good), 0);
  assert.throws(
    () => dbPlanMain(["planner-check"], fakeRuntime({ env: {} })),
    /DB_URL is not set/,
  );
});

test("the production database job verifies the planner credential before planning", () => {
  const deploy = readFileSync(
    new URL("../workflows/deploy.yaml", import.meta.url),
    "utf8",
  );
  assert.match(
    deploy,
    /plan_environment: preflight\n\s+require_read_only_planner: true/,
  );
  const shared = readFileSync(
    new URL("../workflows/deploy-database.yaml", import.meta.url),
    "utf8",
  );
  const checks = [...shared.matchAll(/db-plan\.mjs" planner-check/g)].length;
  assert.equal(checks, 2, "both plan jobs run the check");
  for (const plan of ["migrations-plan", "schema-plan"]) {
    assert.ok(
      shared.indexOf('db-plan.mjs" planner-check') <
        shared.indexOf(`db-plan.mjs" ${plan}`),
    );
  }
});

test("migrations-apply refuses a destructive migration outside the destructive gate, and a changed plan", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(
    join(root, "supabase", "migrations", "20261201000000_drop.sql"),
    "ALTER TABLE a DROP COLUMN b;",
  );
  const push = {
    upToDate: false,
    migrations: ["20261201000000_drop.sql"],
    seeds: [],
    roles: [],
  };
  const url = "postgresql://u:p@db/postgres";

  const plan = fakeRuntime({ push, env: { DB_URL: url } });
  assert.equal(dbPlanMain(["migrations-plan"], plan, { repoRoot: root }), 0);
  const { hash } = JSON.parse(
    readFileSync(join(plan.env.PLAN_DIR, "migrations-plan.json"), "utf8"),
  );

  const ungated = fakeRuntime({ push, env: { DB_URL: url } });
  assert.equal(
    dbPlanMain(["migrations-apply", "--expect-hash", hash], ungated, {
      repoRoot: root,
    }),
    1,
  );
  assert.ok(
    !ungated.calls.some((c) => c.includes("--yes")),
    "nothing was pushed",
  );

  const gated = fakeRuntime({
    push,
    env: { DB_URL: url, DESTRUCTIVE_APPROVED: "true" },
  });
  assert.equal(
    dbPlanMain(["migrations-apply", "--expect-hash", hash], gated, {
      repoRoot: root,
    }),
    0,
  );
  assert.ok(
    gated.calls.some((c) => c.includes("--yes")),
    "the push ran",
  );

  const changed = fakeRuntime({
    push,
    env: { DB_URL: url, DESTRUCTIVE_APPROVED: "true" },
  });
  assert.equal(
    dbPlanMain(["migrations-apply", "--expect-hash", "0".repeat(64)], changed, {
      repoRoot: root,
    }),
    1,
  );
  assert.ok(
    !changed.calls.some((c) => c.includes("--yes")),
    "a stale approval pushes nothing",
  );
});

/** Runs real git and tar (the PR check shells out to them); fakes the rest. */
function checkRuntime(handler) {
  return {
    cli: "supabase",
    env: { PLAN_DIR: mkdtempSync(join(tmpdir(), "plan-")) },
    log: () => {},
    run(cmd, args, opts = {}) {
      if (cmd === "git" || cmd === "tar") {
        const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: "utf8" });
        return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
      }
      return handler(args, opts) ?? { status: 0, stdout: "", stderr: "" };
    },
  };
}

function gitRepo() {
  const root = mkdtempSync(join(tmpdir(), "check-repo-"));
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git("init", "-q", "-b", "main", ".");
  git("config", "user.email", "t@example.org");
  git("config", "user.name", "t");
  return { root, git };
}

/**
 * The PR check compares the BASE tree with the HEAD tree, not the head tree
 * with the committed migrations. A real git repository stands in for the
 * checkout; the Supabase CLI is faked and records which tree each scratch
 * database was built from.
 */
test("the PR check diffs the base's database against the head's", () => {
  const { root, git } = gitRepo();
  const table = join(root, "supabase", "schemas", "app", "tables");
  mkdirSync(table, { recursive: true });
  writeFileSync(join(root, "supabase", "config.toml"), "[db]\nport = 54322\n");
  writeFileSync(join(root, "supabase", "schemas", "app", "schema.sql"), "");
  writeFileSync(join(table, "t.sql"), "BASE TREE");
  git("add", "-A");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(table, "t.sql"), "HEAD TREE");
  git("commit", "-qam", "head");

  const builtFrom = {};
  let diffArgs = null;
  const rt = checkRuntime((args, opts) => {
    if (args[0] === "db" && args[1] === "start") {
      const name = opts.cwd.endsWith("base") ? "base" : "head";
      builtFrom[name] = readFileSync(
        join(opts.cwd, "supabase", "schemas", "app", "tables", "t.sql"),
        "utf8",
      );
    }
    if (args[0] === "db" && args[1] === "diff") {
      diffArgs = args;
      return {
        status: 0,
        stdout: JSON.stringify({
          diff: 'ALTER TABLE "app"."t" DROP COLUMN "c";',
          dropStatements: [],
        }),
        stderr: "",
      };
    }
    return undefined;
  });
  const out = join(rt.env.PLAN_DIR, "gh-output");
  rt.env.GITHUB_OUTPUT = out;
  assert.equal(
    dbPlanMain(["check", "--base", base], rt, { repoRoot: root }),
    0,
  );
  assert.deepEqual(builtFrom, { base: "BASE TREE", head: "HEAD TREE" });
  assert.ok(diffArgs, "the diff ran");
  assert.notEqual(
    diffArgs[diffArgs.indexOf("--from") + 1],
    diffArgs[diffArgs.indexOf("--to") + 1],
    "base and head are different databases",
  );
  assert.match(readFileSync(out, "utf8"), /destructive=true/);
});

test("the PR check handles a base with no supabase/ directory", () => {
  const { root, git } = gitRepo();
  writeFileSync(join(root, "README"), "x");
  git("add", "-A");
  git("commit", "-qm", "empty");
  const base = git("rev-parse", "HEAD");
  mkdirSync(join(root, "supabase", "schemas", "app"), { recursive: true });
  writeFileSync(join(root, "supabase", "config.toml"), "[db]\nport = 54322\n");
  writeFileSync(join(root, "supabase", "schemas", "app", "schema.sql"), "");
  git("add", "-A");
  git("commit", "-qm", "add supabase");
  const rt = checkRuntime((args) =>
    args[0] === "db" && args[1] === "diff"
      ? {
          status: 0,
          stdout: JSON.stringify({
            diff: 'CREATE SCHEMA "app";',
            dropStatements: [],
          }),
          stderr: "",
        }
      : undefined,
  );
  assert.equal(
    dbPlanMain(["check", "--base", base], rt, { repoRoot: root }),
    0,
  );
});

test("a failing CLI call does not leak the target's password into the error", () => {
  assert.equal(
    redactUrls(
      "supabase db diff --from postgresql://role.ref:s3cr%40t@host:5432/postgres --to postgres://postgres:postgres@127.0.0.1:1/p failed",
    ),
    "supabase db diff --from postgresql://role.ref:***@host:5432/postgres --to postgres://postgres:***@127.0.0.1:1/p failed",
  );
});

test("db-plan refuses to plan with no DB_URL", () => {
  assert.throws(
    () => dbPlanMain(["migrations-plan"], fakeRuntime({ env: {} })),
    /DB_URL is not set/,
  );
});

/* ---------- destructive-label ---------- */

const labeled = (login, label = "allow-destructive") => ({
  event: "labeled",
  label: { name: label },
  actor: { login },
});
const unlabeled = (login, label = "allow-destructive") => ({
  event: "unlabeled",
  label: { name: label },
  actor: { login },
});

function fakeApi({ timeline, roles }) {
  return async (path) => {
    const [bare] = path.split("?");
    if (bare.endsWith("/timeline")) return timeline;
    const match = /collaborators\/([^/]+)\/permission$/.exec(bare);
    if (match) {
      if (!(match[1] in roles)) throw new Error(`404 ${match[1]}`);
      return { permission: roles[match[1]], role_name: roles[match[1]] };
    }
    throw new Error(`unexpected GET ${path}`);
  };
}

test("labelState follows the most recent labeled or unlabeled event for the one label", () => {
  assert.deepEqual(labelState([]), { present: false });
  assert.deepEqual(labelState([labeled("a"), labeled("b", "other")]), {
    present: true,
    actor: "a",
  });
  assert.deepEqual(labelState([labeled("a"), unlabeled("b")]), {
    present: false,
  });
  assert.deepEqual(labelState([labeled("a"), unlabeled("b"), labeled("c")]), {
    present: true,
    actor: "c",
  });
});

test("the gate rejects a label applied by someone who is not devops", async () => {
  const roles = {
    lathryx: "maintain",
    sloan: "admin",
    member: "write",
    reviewer: "triage",
  };
  const gate = (timeline) =>
    evaluateGate({ api: fakeApi({ timeline, roles }), repo: "O/R", pr: 1 });
  assert.equal((await gate([])).pass, true);
  assert.equal((await gate([labeled("lathryx")])).pass, true);
  assert.equal((await gate([labeled("sloan")])).pass, true);
  const rejected = await gate([labeled("member")]);
  assert.equal(rejected.pass, false);
  assert.equal(rejected.reject, true);
  assert.match(rejected.message, /@member/);
  assert.equal((await gate([labeled("reviewer")])).pass, false);
  // A login GitHub cannot resolve (a deleted account) is rejected, not a crash.
  const stranger = await gate([labeled("ghost")]);
  assert.equal(stranger.pass, false);
  assert.equal(stranger.reject, true);
  // Re-applied by a devops member after a rejected one: the latest applier counts.
  assert.equal(
    (await gate([labeled("member"), unlabeled("lathryx"), labeled("lathryx")]))
      .pass,
    true,
  );
  // A label that was removed is no label.
  assert.equal(
    (await gate([labeled("member"), unlabeled("lathryx")])).pass,
    true,
  );
});

test("destructive SQL needs the label; harmless SQL does not", async () => {
  const api = (timeline) => fakeApi({ timeline, roles: {} });
  assert.equal(
    (
      await evaluateNeed({
        api: api([]),
        repo: "O/R",
        pr: 1,
        destructive: false,
      })
    ).pass,
    true,
  );
  assert.equal(
    (
      await evaluateNeed({
        api: api([]),
        repo: "O/R",
        pr: 1,
        destructive: true,
      })
    ).pass,
    false,
  );
  assert.equal(
    (
      await evaluateNeed({
        api: api([labeled("x")]),
        repo: "O/R",
        pr: 1,
        destructive: true,
      })
    ).pass,
    true,
  );
  const stale = await evaluateNeed({
    api: api([labeled("x")]),
    repo: "O/R",
    pr: 1,
    destructive: true,
    ignoreLabel: true,
  });
  assert.equal(stale.pass, false, "a label seen right after a push is stale");
  assert.match(stale.message, /apply the label again/);
  assert.equal(
    (
      await evaluateNeed({
        api: api([labeled("x")]),
        repo: "O/R",
        pr: 1,
        destructive: false,
        ignoreLabel: true,
      })
    ).pass,
    true,
    "non-destructive SQL never needed it",
  );
});

test("changedMigrations reads renamed migrations too", () => {
  const seen = [];
  const rt = {
    env: {},
    log: () => {},
    run: (cmd, args) => {
      seen.push(args);
      return { status: 0, stdout: "", stderr: "" };
    },
  };
  changedMigrations(rt, tmpdir(), "abc");
  assert.ok(seen[0].includes("--diff-filter=AMR"));
});

test("the pull request is found from a merge queue branch name", () => {
  assert.equal(
    pullFromQueueRef("gh-readonly-queue/main/pr-123-0123abcdef"),
    123,
  );
  assert.equal(
    pullFromQueueRef("refs/heads/gh-readonly-queue/main/pr-7-abc"),
    7,
  );
  assert.equal(pullFromQueueRef("refs/heads/feature"), undefined);
});

/* ---------- config-push ---------- */

test("env references are found", () => {
  assert.deepEqual(
    envRefs('a = "env(A)"\nb = "x"\n# env(B)\nc = "env(A)"').sort(),
    ["A", "B"],
  );
});

test("an unset env() is dropped from a list, a switched-off section, and refused elsewhere", () => {
  const toml = [
    "[auth]",
    'site_url = "env(BASE_URL)"',
    "additional_redirect_urls = [",
    '  "env(BASE_URL_CALLBACK)",',
    '  "env(UNSET_URL_CALLBACK)",',
    '  "dev.dogpack://login-callback",',
    "]",
    "[auth.external.linkedin_oidc]",
    "enabled = false",
    'client_id = "env(LINKEDIN_CLIENT_ID)"',
    "[auth.external.github]",
    "enabled = true",
    'client_id = "env(GH_CLIENT_ID)"',
  ].join("\n");
  const set = {
    BASE_URL: "https://x",
    BASE_URL_CALLBACK: "https://x/cb",
    GH_CLIENT_ID: "id",
  };
  const result = resolveConfig(toml, (n) => set[n]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.dropped.sort(), [
    "LINKEDIN_CLIENT_ID",
    "UNSET_URL_CALLBACK",
  ]);
  assert.doesNotMatch(result.toml, /UNSET_URL|LINKEDIN_CLIENT_ID/);
  assert.match(result.toml, /dev\.dogpack:\/\/login-callback/);
  assert.match(
    result.toml,
    /env\(BASE_URL_CALLBACK\)/,
    "set ones are left for the CLI",
  );

  const broken = resolveConfig(toml, (n) =>
    n === "GH_CLIENT_ID" ? undefined : set[n],
  );
  assert.deepEqual(broken.missing, ["GH_CLIENT_ID"]);
});

test("config push --dry-run runs `config diff`, never a push", () => {
  const root = mkdtempSync(join(tmpdir(), "cfg-"));
  mkdirSync(join(root, "supabase"), { recursive: true });
  writeFileSync(join(root, "supabase", "config.toml"), 'project_id = "x"\n');
  const env = {
    PROJECT_REF: "abcdefghijklmnopqrst",
    SUPABASE_ACCESS_TOKEN: "sbp_x",
  };
  const run = (dryRun) => {
    const seen = [];
    const code = pushConfig({
      env,
      repoRoot: root,
      dryRun,
      spawn: (_cmd, args, options) => {
        seen.push({ args, stdio: options.stdio });
        return { status: 0 };
      },
    });
    return { code, seen: seen[0] };
  };
  const dry = run(true);
  assert.equal(dry.code, 0);
  assert.deepEqual(dry.seen.args, [
    "config",
    "diff",
    "--project-ref",
    "abcdefghijklmnopqrst",
  ]);
  assert.ok(!dry.seen.args.includes("push"));
  const real = run(false);
  assert.deepEqual(real.seen.args, [
    "config",
    "push",
    "--project-ref",
    "abcdefghijklmnopqrst",
    "--yes",
  ]);
});

test("an inline array loses only its unset entries", () => {
  const result = resolveConfig('urls = ["a", "env(X)", "b"]', () => undefined);
  assert.equal(result.toml, 'urls = ["a", "b"]');
});

test("the callback variables are derived from their URL, as supabase/env.ts declares", () => {
  const lookup = lookupFrom({
    VARS_JSON: JSON.stringify({
      BASE_URL: "https://devdogsuga.org/",
    }),
  });
  assert.equal(
    lookup("BASE_URL_CALLBACK"),
    "https://devdogsuga.org/auth/callback",
  );
  // No URL, no callback: the entry is dropped from the allowlist, not sent as text.
  assert.equal(lookup("UNSET_URL_CALLBACK"), undefined);
  // A stored value wins over the derivation.
  assert.equal(
    lookupFrom({
      VARS_JSON: JSON.stringify({
        BASE_URL: "https://a",
        BASE_URL_CALLBACK: "https://b/cb",
      }),
    })("BASE_URL_CALLBACK"),
    "https://b/cb",
  );
});

test("the derivation matches the registry's own formulas", () => {
  const manifest = readFileSync(
    join(import.meta.dirname, "..", "..", "supabase", "env.ts"),
    "utf8",
  );
  for (const name of ["BASE_URL"]) {
    assert.ok(
      manifest.includes(`example: "$${name}/auth/callback"`),
      `supabase/env.ts no longer derives ${name}_CALLBACK as $${name}/auth/callback`,
    );
  }
});

test("secrets win over variables in the lookup", () => {
  const lookup = lookupFrom({
    VARS_JSON: '{"A":"var","B":"b"}',
    SECRETS_JSON: '{"A":"secret"}',
    C: "env",
  });
  assert.equal(lookup("A"), "secret");
  assert.equal(lookup("B"), "b");
  assert.equal(lookup("C"), "env");
  assert.equal(lookup("D"), undefined);
  assert.throws(() => lookupFrom({ SECRETS_JSON: "{" }), /not valid JSON/);
});

/** A fake fetch answering from a list of [matcher, response] pairs, recording calls. */
function scriptedFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      body: init.body,
    });
    for (const [method, pattern, respond] of routes) {
      if (method === (init.method ?? "GET") && pattern.test(String(url))) {
        const { status = 200, json = {} } = respond(init);
        return new Response(status === 204 ? null : JSON.stringify(json), {
          status,
          headers: {
            "content-type": "application/json",
            ...(json.__headers ?? {}),
          },
        });
      }
    }
    throw new Error(`unexpected ${init.method ?? "GET"} ${url}`);
  };
  fn.calls = calls;
  return fn;
}

const PROVIDER_ENV = {
  PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_ACCESS_TOKEN: "sbp_x",
  SECRET_KEY: "sb_secret_x",
  DEVDOGS_OAUTH_CLIENT_ID: "client-id",
  DEVDOGS_OAUTH_CLIENT_SECRET: "client-secret",
  DEVDOGS_OAUTH_BASE_URL: "https://api-staging.devdogsuga.org",
};

test("register creates the provider with the platform's discovered issuer, enabling custom OAuth first", async () => {
  const fetchImpl = scriptedFetch([
    [
      "GET",
      /api\.supabase\.com.*config\/auth$/,
      () => ({ json: { custom_oauth_enabled: false } }),
    ],
    ["PATCH", /api\.supabase\.com.*config\/auth$/, () => ({ json: {} })],
    [
      "GET",
      /openid-configuration$/,
      () => ({ json: { issuer: "https://platformref.supabase.co/auth/v1" } }),
    ],
    [
      "GET",
      /custom-providers\/custom:devdogsuga$/,
      () => ({ status: 404, json: {} }),
    ],
    ["POST", /custom-providers$/, () => ({ status: 201, json: {} })],
  ]);
  const result = await registerProvider({ env: PROVIDER_ENV, fetchImpl });
  assert.deepEqual(result, {
    action: "created",
    issuer: "https://platformref.supabase.co/auth/v1",
  });
  const patch = fetchImpl.calls.find((c) => c.method === "PATCH");
  assert.deepEqual(JSON.parse(patch.body), { custom_oauth_enabled: true });
  const post = JSON.parse(
    fetchImpl.calls.find((c) => c.method === "POST").body,
  );
  assert.equal(post.identifier, "custom:devdogsuga");
  assert.equal(post.provider_type, "oidc");
  assert.equal(post.issuer, "https://platformref.supabase.co/auth/v1");
  assert.equal(
    post.attribute_mapping,
    undefined,
    "no attribute mapping: sub must stay the platform user id",
  );
  assert.ok(
    fetchImpl.calls.some(
      (c) =>
        c.url ===
        "https://abcdefghijklmnopqrst.supabase.co/auth/v1/admin/custom-providers",
    ),
  );
});

test("register updates an existing provider, and skips a project with no client", async () => {
  const fetchImpl = scriptedFetch([
    [
      "GET",
      /api\.supabase\.com.*config\/auth$/,
      () => ({ json: { custom_oauth_enabled: true } }),
    ],
    [
      "GET",
      /openid-configuration$/,
      () => ({ json: { issuer: "https://platformref.supabase.co/auth/v1" } }),
    ],
    [
      "GET",
      /custom-providers\/custom:devdogsuga$/,
      () => ({ json: { identifier: "custom:devdogsuga" } }),
    ],
    ["PUT", /custom-providers\/custom:devdogsuga$/, () => ({ json: {} })],
  ]);
  assert.equal(
    (await registerProvider({ env: PROVIDER_ENV, fetchImpl })).action,
    "updated",
  );
  assert.ok(
    !fetchImpl.calls.some((c) => c.method === "PATCH"),
    "already enabled: not patched",
  );

  const none = scriptedFetch([]);
  const env = { ...PROVIDER_ENV };
  delete env.DEVDOGS_OAUTH_CLIENT_ID;
  assert.equal(
    (await registerProvider({ env, fetchImpl: none })).action,
    "skipped",
  );
  assert.equal(none.calls.length, 0);
});

test("register waits out GoTrue's 'disabled' 404 right after enabling custom OAuth, and sends the identifier unencoded", async () => {
  let reads = 0;
  const fetchImpl = scriptedFetch([
    [
      "GET",
      /api\.supabase\.com.*config\/auth$/,
      () => ({ json: { custom_oauth_enabled: false } }),
    ],
    ["PATCH", /api\.supabase\.com.*config\/auth$/, () => ({ json: {} })],
    [
      "GET",
      /openid-configuration$/,
      () => ({ json: { issuer: "https://platformref.supabase.co/auth/v1" } }),
    ],
    [
      "GET",
      /custom-providers\/custom:devdogsuga$/,
      () =>
        ++reads < 3
          ? {
              status: 404,
              json: { msg: "Custom OAuth providers are disabled" },
            }
          : { status: 404, json: { msg: "provider not found" } },
    ],
    ["POST", /custom-providers$/, () => ({ status: 201, json: {} })],
  ]);
  const waits = [];
  const result = await registerProvider({
    env: PROVIDER_ENV,
    fetchImpl,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(result.action, "created");
  assert.equal(waits.length, 2, "waited twice for the Auth service to reload");
  assert.ok(
    fetchImpl.calls.every((c) => !c.url.includes("%3A")),
    "the identifier colon is never percent-encoded",
  );

  const stuck = scriptedFetch([
    [
      "GET",
      /api\.supabase\.com.*config\/auth$/,
      () => ({ json: { custom_oauth_enabled: true } }),
    ],
    [
      "GET",
      /openid-configuration$/,
      () => ({ json: { issuer: "https://platformref.supabase.co/auth/v1" } }),
    ],
    [
      "GET",
      /custom-providers\/custom:devdogsuga$/,
      () => ({
        status: 404,
        json: { msg: "Custom OAuth providers are disabled" },
      }),
    ],
    [
      "POST",
      /custom-providers$/,
      () => ({
        status: 404,
        json: { msg: "Custom OAuth providers are disabled" },
      }),
    ],
  ]);
  await assert.rejects(
    registerProvider({
      env: PROVIDER_ENV,
      fetchImpl: stuck,
      sleep: async () => {},
    }),
    /creating custom:devdogsuga failed: 404/,
  );
});

test("register never guesses the platform: no DEVDOGS_OAUTH_BASE_URL is an error before any request", async () => {
  const none = scriptedFetch([]);
  const env = { ...PROVIDER_ENV };
  delete env.DEVDOGS_OAUTH_BASE_URL;
  await assert.rejects(
    registerProvider({ env, fetchImpl: none }),
    /DEVDOGS_OAUTH_BASE_URL/,
  );
  assert.equal(none.calls.length, 0, "nothing was sent anywhere");
});

test("discoverIssuer refuses a discovery document without an issuer", async () => {
  const fetchImpl = scriptedFetch([
    ["GET", /openid-configuration$/, () => ({ json: {} })],
  ]);
  await assert.rejects(discoverIssuer("https://x", fetchImpl), /no issuer/);
});

/* ---------- worker-smoke and q39 ---------- */

const SMOKE = {
  hosts: { staging: "staging.example.org" },
  publicPaths: ["/", "/docs"],
  protectedPath: "/dashboard",
  protectedRedirectPrefix: "/auth",
};

test("the version override header pins a request to one version", () => {
  assert.equal(
    overrideHeader("staging-platform", "abc"),
    'staging-platform="abc"',
  );
});

test("smoke passes when public pages load and the protected page redirects", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers });
    const path = new URL(url).pathname;
    if (path === "/dashboard")
      return new Response(null, {
        status: 307,
        headers: { location: "/auth?callbackPath=%2Fdashboard" },
      });
    return new Response("ok", { status: 200 });
  };
  const checks = await runSmoke({
    smoke: SMOKE,
    tier: "staging",
    workerName: "staging-platform",
    versionId: "v1",
    fetchImpl,
  });
  assert.ok(
    checks.every((c) => c.ok),
    JSON.stringify(checks),
  );
  assert.equal(checks.length, 3);
  assert.ok(
    seen.every(
      (s) =>
        s.headers["cloudflare-workers-version-overrides"] ===
        'staging-platform="v1"',
    ),
  );
});

test("smoke fails on a broken page and on an unprotected protected page", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/docs") return new Response("boom", { status: 500 });
    if (path === "/dashboard") return new Response("secret", { status: 200 });
    return new Response("ok", { status: 200 });
  };
  const checks = await runSmoke({
    smoke: SMOKE,
    tier: "staging",
    fetchImpl,
  });
  assert.deepEqual(
    checks.map((c) => c.ok),
    [true, false, false],
  );
  await assert.rejects(
    runSmoke({ smoke: SMOKE, tier: "production", fetchImpl }),
    /no production host/,
  );
  await assert.rejects(
    runSmoke({ smoke: SMOKE, tier: "staging", versionId: "v", fetchImpl }),
    /needs --worker-name/,
  );
});

test("a 5xx is a failure with no retry, and the check says what answered", async () => {
  const calls = { "/": 0, "/docs": 0 };
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/dashboard")
      return new Response(null, {
        status: 307,
        headers: { location: "/auth" },
      });
    calls[path]++;
    return path === "/"
      ? new Response("warming", {
          status: 503,
          headers: { "cf-ray": "abc-ATL" },
        })
      : new Response("fine", { status: 200 });
  };
  const checks = await runSmoke({ smoke: SMOKE, tier: "staging", fetchImpl });
  assert.deepEqual(
    checks.map((c) => c.ok),
    [false, true, true],
  );
  assert.equal(calls["/"], 1);
  assert.match(checks[0].detail, /status 503, cf-ray abc-ATL, body "warming"/);
});

test("settle waits out the 5xx window after a switch and reports it", async () => {
  let n = 0;
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/dashboard")
      return new Response(null, {
        status: 307,
        headers: { location: "/auth" },
      });
    n += 1;
    // the first 4 probes meet the skew 503, then the version has settled
    return new Response("x", { status: n <= 4 ? 503 : 200 });
  };
  const checks = await runSmoke({
    smoke: SMOKE,
    tier: "staging",
    fetchImpl,
    settle: { ms: 5000, stable: 3, intervalMs: 0, retryDelayMs: 0 },
  });
  assert.equal(checks[0].name, "the version answers without a 5xx");
  assert.equal(checks[0].ok, true);
  assert.match(
    checks[0].detail,
    /3 answers in a row after 4 5xx or errored answers first \(503 x4\)/,
  );
  assert.ok(
    checks.every((c) => c.ok),
    JSON.stringify(checks),
  );
});

test("after settling, a page that answers 5xx is asked once more and the retry is reported", async () => {
  let probes = 0;
  const calls = { "/docs": 0 };
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/dashboard")
      return new Response(null, {
        status: 307,
        headers: { location: "/auth" },
      });
    probes += 1;
    // quiet for the settle probes, then /docs has one more 503 and recovers
    if (path === "/docs" && probes > 3) {
      calls["/docs"] += 1;
      return new Response("x", { status: calls["/docs"] === 1 ? 503 : 200 });
    }
    return new Response("x", { status: 200 });
  };
  const checks = await runSmoke({
    smoke: SMOKE,
    tier: "staging",
    fetchImpl,
    settle: { ms: 5000, stable: 3, intervalMs: 0, retryDelayMs: 0 },
  });
  assert.ok(
    checks.every((c) => c.ok),
    JSON.stringify(checks),
  );
  const last = checks.at(-1);
  assert.equal(
    last.name,
    "pages that needed one retry after the version settled",
  );
  assert.equal(last.detail, "/docs answered 503, then 200");
  // two 503s in a row still fail
  let seen = 0;
  const stuck = await runSmoke({
    smoke: SMOKE,
    tier: "staging",
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      if (path === "/dashboard")
        return new Response(null, {
          status: 307,
          headers: { location: "/auth" },
        });
      seen += 1;
      return new Response("x", {
        status: path === "/docs" && seen > 3 ? 503 : 200,
      });
    },
    settle: { ms: 5000, stable: 3, intervalMs: 0, retryDelayMs: 0 },
  });
  assert.equal(stuck.find((c) => c.name === "/docs answers 200").ok, false);
});

test("settle does not forgive a version that keeps answering 5xx", async () => {
  const fetchImpl = async () => new Response("boom", { status: 503 });
  const checks = await runSmoke({
    smoke: SMOKE,
    tier: "staging",
    fetchImpl,
    settle: { ms: 30, stable: 3, intervalMs: 1 },
  });
  assert.equal(checks[0].ok, false);
  assert.match(checks[0].detail, /still failing after/);
  assert.match(checks[0].detail, /503 x\d+/);
});

test("settle counts a network error as a 5xx and a clean version needs no waiting", async () => {
  let n = 0;
  const flaky = async () => {
    n += 1;
    if (n === 1) throw new Error("connection reset");
    return new Response("x", { status: 200 });
  };
  const [first] = await runSmoke({
    smoke: { ...SMOKE, protectedPath: undefined },
    tier: "staging",
    fetchImpl: flaky,
    settle: { ms: 5000, stable: 2, intervalMs: 0, retryDelayMs: 0 },
  });
  assert.match(
    first.detail,
    /after 1 5xx or errored answers first \(error x1\)/,
  );
  const [clean] = await runSmoke({
    smoke: { ...SMOKE, protectedPath: undefined },
    tier: "staging",
    fetchImpl: async () => new Response("x", { status: 200 }),
    settle: { ms: 5000, stable: 2, intervalMs: 0, retryDelayMs: 0 },
  });
  assert.equal(clean.detail, "2 answers in a row after no 5xx");
});

test("expected statuses prove a Worker that answers something other than 200", async () => {
  const fetchImpl = async (url) =>
    new Response("x", {
      status: new URL(url).pathname === "/follow" ? 426 : 403,
    });
  const smoke = {
    hosts: { production: "relay.example.org" },
    publicPaths: [],
    expectedStatuses: { "/follow": 426, "/": 403 },
  };
  const checks = await runSmoke({ smoke, tier: "production", fetchImpl });
  assert.deepEqual(
    checks.map((c) => c.ok),
    [true, true],
  );
  const broken = await runSmoke({
    smoke: { ...smoke, expectedStatuses: { "/follow": 200 } },
    tier: "production",
    fetchImpl,
  });
  assert.equal(broken[0].ok, false);
});

test("the uploaded version is read from wrangler's output file", () => {
  const ndjson = [
    JSON.stringify({ type: "wrangler-session", version: 1 }),
    "not json",
    JSON.stringify({
      type: "version-upload",
      version: 1,
      worker_name: "old",
      version_id: "11111111-1111-1111-1111-111111111111",
    }),
    JSON.stringify({
      type: "version-upload",
      version: 1,
      worker_name: "staging-platform",
      version_id: "22222222-2222-2222-2222-222222222222",
    }),
  ].join("\n");
  assert.deepEqual(lastUpload(ndjson), {
    versionId: "22222222-2222-2222-2222-222222222222",
    workerName: "staging-platform",
  });
  assert.equal(lastUpload(""), undefined);
});

test("the active version is the one with the most traffic", () => {
  assert.equal(
    activeVersion(
      JSON.stringify({
        versions: [
          { version_id: "a", percentage: 10 },
          { version_id: "b", percentage: 90 },
        ],
      }),
    ),
    "b",
  );
  assert.equal(activeVersion("not json"), undefined);
  assert.equal(activeVersion("{}"), undefined);
});

test("the active version survives pnpm's own stdout lines before the JSON", () => {
  const body = JSON.stringify(
    { id: "d", versions: [{ version_id: "v1", percentage: 100 }] },
    null,
    2,
  );
  assert.equal(
    activeVersion(
      `Already up to date\nDone in 423ms using pnpm v11.8.0\n${body}\n`,
    ),
    "v1",
  );
  assert.equal(activeVersion("Done in 1ms\nnot json"), undefined);
});

/** The OAuth server and the consent page, as a fake. */
function oauthFetch({
  authorizeLocation,
  consentStatus = 404,
  hookedConsentStatus = null,
  clientOk = true,
}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(`${init.method ?? "GET"} ${u.pathname}`);
    if (
      u.pathname === "/auth/v1/admin/oauth/clients" &&
      init.method === "POST"
    ) {
      return clientOk
        ? Response.json({ client_id: "cid" }, { status: 201 })
        : new Response("{}", { status: 500 });
    }
    if (u.pathname === "/auth/v1/oauth/authorize") {
      return new Response(null, {
        status: 302,
        headers: { location: authorizeLocation },
      });
    }
    if (u.pathname === "/oauth/consent") {
      // With an authorization_id the platform sends a visitor to sign in.
      if (u.searchParams.has("authorization_id") && hookedConsentStatus)
        return new Response("", { status: hookedConsentStatus });
      if (u.searchParams.has("authorization_id"))
        return new Response(null, {
          status: 307,
          headers: { location: "/sign-in" },
        });
      return new Response("", { status: consentStatus });
    }
    if (
      u.pathname === "/auth/v1/admin/oauth/clients/cid" &&
      init.method === "DELETE"
    )
      return new Response(null, { status: 204 });
    if (u.pathname === "/auth/v1/.well-known/openid-configuration")
      return Response.json({ authorization_endpoint: "x" });
    return new Response("ok", { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

test("the authorize checks pass, and the throwaway client is always deleted", async () => {
  const fetchImpl = oauthFetch({
    authorizeLocation:
      "https://staging.example.org/oauth/consent?authorization_id=1",
  });
  const checks = await runSmoke({
    smoke: { ...SMOKE, publicPaths: [], protectedPath: undefined },
    tier: "staging",
    fetchImpl,
    authorize: { apiUrl: "https://api.example.org", secretKey: "k" },
  });
  assert.ok(
    checks.every((c) => c.ok),
    JSON.stringify(checks),
  );
  assert.ok(
    fetchImpl.calls.includes("DELETE /auth/v1/admin/oauth/clients/cid"),
  );

  const bad = oauthFetch({
    authorizeLocation: "https://elsewhere.example/login",
    consentStatus: 200,
  });
  const failed = await runSmoke({
    smoke: { ...SMOKE, publicPaths: [], protectedPath: undefined },
    tier: "staging",
    fetchImpl: bad,
    authorize: { apiUrl: "https://api.example.org", secretKey: "k" },
  });
  assert.deepEqual(
    failed.map((c) => c.ok),
    [true, false, false, false, true],
  );
  assert.ok(
    bad.calls.includes("DELETE /auth/v1/admin/oauth/clients/cid"),
    "deleted even though checks failed",
  );
});

test("the consent hand-off accepts the platform's 404 for an unregistered throwaway client, and fails on a 5xx", async () => {
  const run = (hookedConsentStatus) =>
    runSmoke({
      smoke: { ...SMOKE, publicPaths: [], protectedPath: undefined },
      tier: "staging",
      fetchImpl: oauthFetch({
        authorizeLocation:
          "https://staging.example.org/oauth/consent?authorization_id=1",
        hookedConsentStatus,
      }),
      authorize: { apiUrl: "https://api.example.org", secretKey: "k" },
    });
  const handOff = (checks) =>
    checks.find((c) => /consent hand-off/.test(c.name));
  assert.equal(handOff(await run(404)).ok, true);
  assert.match(handOff(await run(404)).detail, /expected/);
  assert.equal(handOff(await run(500)).ok, false);
});

test("the authorize check follows the consent redirect with the version override, and sweeps stale throwaway clients", async () => {
  const seen = [];
  const fetchImpl = oauthFetch({
    authorizeLocation:
      "https://staging.example.org/oauth/consent?authorization_id=1",
  });
  const recording = async (url, init = {}) => {
    if (new URL(url).pathname === "/oauth/consent")
      seen.push(init.headers?.["cloudflare-workers-version-overrides"]);
    return fetchImpl(url, init);
  };
  const checks = await runSmoke({
    smoke: { ...SMOKE, publicPaths: [], protectedPath: undefined },
    tier: "staging",
    workerName: "w",
    versionId: "v1",
    fetchImpl: recording,
    authorize: { apiUrl: "https://api.example.org", secretKey: "k" },
  });
  assert.ok(checks.some((c) => /consent hand-off/.test(c.name) && c.ok));
  assert.deepEqual(
    seen,
    ['w="v1"', 'w="v1"'],
    "both consent requests hit the version under test",
  );

  const now = Date.parse("2026-10-11T12:00:00Z");
  const deleted = [];
  const sweep = await sweepStaleClients({
    api: "https://api.example.org",
    adminHeaders: {},
    now,
    fetchImpl: async (url, init = {}) => {
      if (init.method === "DELETE") {
        deleted.push(String(url).split("/").pop());
        return new Response(null, { status: 204 });
      }
      return Response.json({
        clients: [
          {
            client_id: "old",
            client_name: "deploy smoke (throwaway)",
            created_at: "2026-10-11T10:00:00Z",
          },
          {
            client_id: "fresh",
            client_name: "deploy smoke (throwaway)",
            created_at: "2026-10-11T11:50:00Z",
          },
          {
            client_id: "real",
            client_name: "DogDays",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      });
    },
  });
  assert.equal(sweep, 1);
  assert.deepEqual(
    deleted,
    ["old"],
    "only an old client with the throwaway name goes",
  );
  assert.equal(
    await sweepStaleClients({
      api: "x",
      adminHeaders: {},
      fetchImpl: async () => {
        throw new Error("down");
      },
    }),
    0,
    "a failing sweep is not a smoke failure",
  );
});

test("Q39 in production only reads; in staging it registers a client and runs the hook check", async () => {
  const prod = oauthFetch({ authorizeLocation: "" });
  const production = await q39Checks({
    tier: "production",
    base: "https://devdogsuga.org",
    apiUrl: "https://api.devdogsuga.org",
    secretKey: "ignored",
    dbUrl: "ignored",
    fetchImpl: prod,
    runHookCheck: () => {
      throw new Error("the hook check must not run in production");
    },
  });
  assert.ok(production.every((c) => c.ok));
  assert.ok(
    !prod.calls.some((c) => c.startsWith("POST") || c.startsWith("DELETE")),
    prod.calls.join(),
  );

  const stg = oauthFetch({
    authorizeLocation:
      "https://staging.devdogsuga.org/oauth/consent?authorization_id=1",
  });
  const staging = await q39Checks({
    tier: "staging",
    base: "https://staging.devdogsuga.org",
    apiUrl: "https://api-staging.devdogsuga.org",
    secretKey: "k",
    dbUrl: "postgres://x",
    fetchImpl: stg,
    runHookCheck: () => ({ ok: true, detail: "stub" }),
  });
  assert.ok(
    staging.every((c) => c.ok),
    JSON.stringify(staging),
  );
  assert.ok(staging.some((c) => /hook downgrades/.test(c.name)));
});

/* ---------- check-routes ---------- */

const platformConfig = (routes) => `{
  // comments and trailing commas, as in wrangler.jsonc
  "name": "development-platform",
  "env": {
    "staging": { "routes": ${JSON.stringify(routes.staging ?? [])}, },
    "production": { "routes": ${JSON.stringify(routes.production ?? [])}, },
  },
}`;

const ok = {
  staging: [
    { pattern: "staging.devdogsuga.org", custom_domain: true },
    {
      pattern: "api-staging.devdogsuga.org/moderation/v1/*",
      zone_name: "devdogsuga.org",
    },
  ],
  production: [
    { pattern: "devdogsuga.org", custom_domain: true },
    {
      pattern: "api.devdogsuga.org/moderation/v1/*",
      zone_name: "devdogsuga.org",
    },
  ],
};

const readFrom = (files) => (path) => {
  for (const [name, text] of Object.entries(files)) {
    if (path.endsWith(name)) return text;
  }
  return null;
};

test("parseJsonc reads comments and trailing commas but not a // inside a string", () => {
  assert.deepEqual(
    parseJsonc('{ "a": "https://x//y", /* c */ "b": [1, 2,], // end\n }'),
    { a: "https://x//y", b: [1, 2] },
  );
});

test("the API route table holds when the platform declares its moderation routes", () => {
  assert.deepEqual(
    checkRoutes(
      "/repo",
      readFrom({ "apps/platform/wrangler.jsonc": platformConfig(ok) }),
    ),
    [],
  );
});

test("a missing, mis-zoned or custom-domain API route is a problem", () => {
  const missing = checkRoutes(
    "/repo",
    readFrom({
      "apps/platform/wrangler.jsonc": platformConfig({
        staging: ok.staging.slice(0, 1),
        production: ok.production,
      }),
    }),
  );
  assert.match(
    missing.join("\n"),
    /apps\/platform staging: missing the route api-staging/,
  );
  const custom = checkRoutes(
    "/repo",
    readFrom({
      "apps/platform/wrangler.jsonc": platformConfig({
        ...ok,
        production: [
          ok.production[0],
          {
            pattern: "api.devdogsuga.org/moderation/v1/*",
            custom_domain: true,
          },
        ],
      }),
    }),
  );
  assert.match(custom.join("\n"), /is a custom domain/);
  assert.match(custom.join("\n"), /needs "zone_name"/);
});

test("two Workers may not claim overlapping API paths, and a path belongs to its Worker", () => {
  const catalogConfig = platformConfig({
    staging: [
      {
        pattern: "api-staging.devdogsuga.org/catalog/v1/*",
        zone_name: "devdogsuga.org",
      },
      {
        pattern: "api-staging.devdogsuga.org/moderation/v1/*",
        zone_name: "devdogsuga.org",
      },
    ],
    production: [
      {
        pattern: "api.devdogsuga.org/catalog/v1/*",
        zone_name: "devdogsuga.org",
      },
    ],
  });
  const problems = checkRoutes(
    "/repo",
    readFrom({
      "apps/platform/wrangler.jsonc": platformConfig(ok),
      "apps/catalog/wrangler.jsonc": catalogConfig,
    }),
  );
  const text = problems.join("\n");
  assert.match(text, /overlaps/);
  assert.match(text, /belongs to apps\/platform/);
  assert.equal(overlaps("h/a/*", "h/a/b/*"), true);
  assert.equal(overlaps("h/a/*", "h/b/*"), false);
  assert.equal(overlaps("h/a/*", "other/a/*"), false);
});

test("the real wrangler configs hold the table", () => {
  assert.deepEqual(checkRoutes(join(import.meta.dirname, "..", "..")), []);
});

/* ---------- the runbooks ---------- */

// Q32 and the 3f lane: deploy and rollback, a failed migration, the
// destructive bypass, the table drops, the vanity-subdomain switch, one page
// per credential service, the sign-in incident, Sentry triage, npm and pub.dev
// releases, catalog term rollover, owner-only org actions. The index must link
// every page, and every page must exist with the front matter the docs need.
const RUNBOOKS = [
  "deploys/how-a-deploy-works.md",
  "deploys/rollback.md",
  "deploys/failed-migration.md",
  "deploys/destructive-changes.md",
  "deploys/table-drops.md",
  "deploys/vanity-subdomain-switch.md",
  "deploys/smoke-checks.md",
  "repositories/rulesets.md",
  "repositories/renovate.md",
  "repositories/owner-actions.md",
  "credentials/index.md",
  "credentials/github.md",
  "credentials/cloudflare.md",
  "credentials/supabase.md",
  "credentials/sentry.md",
  "credentials/registries.md",
  "credentials/discord.md",
  "credentials/google-cloud.md",
  "credentials/bitwarden.md",
  "incidents/sign-in-down.md",
  "incidents/sentry-triage.md",
  "releases/publishing.md",
  "releases/catalog-term-rollover.md",
];

test("every runbook page exists, has front matter, and is linked from its index", () => {
  const dir = join(import.meta.dirname, "..", "..", "docs", "operations");
  const index = readFileSync(join(dir, "index.md"), "utf8");
  const credentials = readFileSync(
    join(dir, "credentials", "index.md"),
    "utf8",
  );
  for (const page of RUNBOOKS) {
    const text = readFileSync(join(dir, page), "utf8");
    assert.match(
      text,
      /^---\nname: .+\ndescription: .+\norder: \d+\nsection: infrastructure\n---\n/,
      page,
    );
    // The credential pages hang off their own index; everything else, and
    // that index, off the project's.
    const inCredentials =
      page.startsWith("credentials/") && page !== "credentials/index.md";
    const [from, name, link] = inCredentials
      ? [
          credentials,
          "credentials/index.md",
          `(./${page.slice("credentials/".length)})`,
        ]
      : [index, "index.md", `(./${page})`];
    assert.ok(from.includes(link), `${name} does not link ${page}`);
  }
});

test("the runbooks name no secret value", () => {
  const dir = join(import.meta.dirname, "..", "..", "docs", "operations");
  for (const page of RUNBOOKS) {
    const text = readFileSync(join(dir, page), "utf8");
    assert.doesNotMatch(
      text,
      /(sbp_|sb_secret_|ghp_|github_pat_|eyJ[A-Za-z0-9_-]{20,}|-----BEGIN)/,
      page,
    );
  }
});

test("deploy.yaml's supersede pattern matches the nested production job names and nothing else", () => {
  const workflow = readFileSync(
    new URL("../workflows/deploy.yaml", import.meta.url),
    "utf8",
  );
  const source = /\(\.name \| test\("([^"]+)"\)\)/.exec(workflow)?.[1];
  assert.ok(source, "the supersede jq expression is in deploy.yaml");
  const pattern = new RegExp(source);
  for (const name of [
    "deploy / production-database / apply",
    "deploy / production-database / gate",
    "deploy / production-platform / deploy",
    "production-database / apply",
  ])
    assert.ok(pattern.test(name), name);
  for (const name of [
    "publish",
    "deploy / staging-platform / deploy",
    "deploy / build / build (production)",
    "deploy / resolve",
  ])
    assert.ok(!pattern.test(name), name);
});

/* ---------- review fixes (lane 3f, round 3) ---------- */

test("a DO block that only creates a missing role passes; any other DO block is still opaque", () => {
  const guarded = `do $$ begin if not exists (select 1 from pg_roles where rolname = 'catalog_reader') then create role "catalog_reader" nologin noinherit; end if; end $$;`;
  assert.deepEqual(kinds(guarded), []);
  assert.deepEqual(
    kinds(
      "DO $b$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'x') THEN CREATE ROLE x; END IF; END $b$;",
    ),
    [],
  );
  assert.deepEqual(
    kinds(
      `do $$ begin if not exists (select 1 from pg_roles where rolname = 'x') then create role x; delete from platform.roles; end if; end $$;`,
    ),
    ["DO block"],
  );
  assert.deepEqual(kinds("do $$ begin delete from t; end $$;"), ["DO block"]);
});

test("an upsert and EXPLAIN ANALYZE of a data change are destructive; plain EXPLAIN and DO NOTHING are not", () => {
  assert.deepEqual(
    kinds(
      "INSERT INTO r SELECT * FROM r ON CONFLICT (id) DO UPDATE SET title = 'x';",
    ),
    ["UPSERT (ON CONFLICT DO UPDATE)"],
  );
  assert.deepEqual(
    kinds("INSERT INTO r VALUES (1) ON CONFLICT DO NOTHING;"),
    [],
  );
  assert.deepEqual(kinds("EXPLAIN ANALYZE DELETE FROM r WHERE a = 1;"), [
    "EXPLAIN ANALYZE of DELETE",
  ]);
  assert.deepEqual(kinds("EXPLAIN (ANALYZE, BUFFERS) UPDATE r SET a = 1;"), [
    "EXPLAIN ANALYZE of UPDATE",
  ]);
  assert.deepEqual(kinds("EXPLAIN DELETE FROM r;"), []);
  assert.deepEqual(kinds("EXPLAIN SELECT 1;"), []);
});

test("escape strings and identifiers containing a dollar do not hide a later statement", () => {
  // E'...\'...' keeps the string open past the escaped quote.
  assert.deepEqual(kinds("select E'it\\'s; drop table x; --'; drop table y;"), [
    "DROP TABLE",
  ]);
  // `a$b$` is an identifier, not the start of a dollar quote that swallows the DROP.
  assert.deepEqual(kinds("select 1 as a$b$; drop table x; select 2 as c$b$;"), [
    "DROP TABLE",
  ]);
  // A tag with digits is a tag: the body is a body.
  assert.deepEqual(
    kinds(
      "create function f() returns int as $fn1$ select 1; delete from x; $fn1$ language sql;",
    ),
    [],
  );
});

test("splitRawStatements keeps each statement's own text, and function bodies whole", () => {
  assert.deepEqual(
    splitRawStatements(
      "-- c\nselect 1;\n/* x */ create function f() returns int as $$ select 1; $$ language sql;\nselect 2",
    ),
    [
      "-- c\nselect 1;",
      "/* x */ create function f() returns int as $$ select 1; $$ language sql;",
      "select 2",
    ],
  );
});

test("seeds are classified too: a DO block is read, and anything but an insert is destructive", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(root, "supabase", "seed", "roles"), { recursive: true });
  mkdirSync(join(root, "supabase", "seed", "officers"), { recursive: true });
  const seeds = {
    "roles/ok.sql":
      "insert into platform.roles (id) values (1) on conflict do nothing;",
    "roles/delete.sql":
      "delete from platform.roles where title = 'Vice President';",
    "roles/upsert.sql":
      "insert into platform.roles (id, title) values (1, 'x') on conflict (id) do update set title = 'x';",
    "officers/ok.sql":
      "begin; do $$ declare v uuid; begin insert into auth.users (id) values (v) on conflict do nothing; if not exists (select 1 from t) then insert into t values (1); end if; end $$; commit;",
    "officers/update.sql":
      "begin; do $$ begin update platform.profile set bio = 'x'; end $$; commit;",
    "officers/dynamic.sql": "do $$ begin execute 'truncate t'; end $$;",
  };
  for (const [name, sql] of Object.entries(seeds)) {
    writeFileSync(join(root, "supabase", "seed", name), sql);
  }
  const out = classifyPendingSeeds(root, [
    ...Object.keys(seeds).map((n) => `supabase/seed/${n}`),
    "supabase/seed/roles/missing.sql",
  ]);
  assert.deepEqual(
    out.map((o) => [o.file.replace("supabase/seed/", ""), o.destructive]),
    [
      ["roles/ok.sql", false],
      ["roles/delete.sql", true],
      ["roles/upsert.sql", true],
      ["officers/ok.sql", false],
      ["officers/update.sql", true],
      ["officers/dynamic.sql", true],
      ["roles/missing.sql", true],
    ],
  );
});

test("a destructive seed file is held by the gate like a migration, at plan and at apply", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(root, "supabase", "seed", "roles"), { recursive: true });
  writeFileSync(
    join(root, "supabase", "seed", "roles", "probe.sql"),
    "delete from platform.roles where title = 'Vice President';",
  );
  const push = {
    upToDate: false,
    migrations: [],
    seeds: ["supabase/seed/roles/probe.sql"],
    roles: [],
  };
  const url = "postgresql://u:p@db/postgres";
  const plan = fakeRuntime({ push, env: { DB_URL: url } });
  const out = join(plan.env.PLAN_DIR, "gh-output");
  plan.env.GITHUB_OUTPUT = out;
  assert.equal(
    dbPlanMain(["migrations-plan", "--include-seed"], plan, { repoRoot: root }),
    0,
  );
  assert.match(readFileSync(out, "utf8"), /destructive=true/);
  const { hash } = JSON.parse(
    readFileSync(join(plan.env.PLAN_DIR, "migrations-plan.json"), "utf8"),
  );
  const ungated = fakeRuntime({ push, env: { DB_URL: url } });
  assert.equal(
    dbPlanMain(
      ["migrations-apply", "--include-seed", "--expect-hash", hash],
      ungated,
      {
        repoRoot: root,
      },
    ),
    1,
  );
  assert.ok(
    !ungated.calls.some((c) => c.includes("--yes")),
    "nothing was pushed",
  );
  const gated = fakeRuntime({
    push,
    env: { DB_URL: url, DESTRUCTIVE_APPROVED: "true" },
  });
  assert.equal(
    dbPlanMain(
      ["migrations-apply", "--include-seed", "--expect-hash", hash],
      gated,
      {
        repoRoot: root,
      },
    ),
    0,
  );
  assert.ok(
    gated.calls.some((c) => c.includes("--yes")),
    "the push ran",
  );
});

test("the PR check reads the seed files a pull request adds, and the workflow notices them", () => {
  const { root, git } = gitRepo();
  mkdirSync(join(root, "supabase", "seed", "roles"), { recursive: true });
  writeFileSync(join(root, "README"), "x");
  git("add", "-A");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(
    join(root, "supabase", "seed", "roles", "probe.sql"),
    "delete from platform.roles;",
  );
  git("add", "-A");
  git("commit", "-qm", "head");
  const rt = {
    env: {},
    log: () => {},
    run: (cmd, args, opts) => {
      const r = spawnSync(cmd, args, { cwd: opts?.cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
    },
  };
  const found = changedMigrations(rt, root, base);
  assert.deepEqual(
    found.map((f) => [f.file, f.destructive]),
    [["supabase/seed/roles/probe.sql", true]],
  );
  const workflow = readFileSync(
    new URL("../workflows/database-pr.yaml", import.meta.url),
    "utf8",
  );
  assert.match(
    workflow,
    /-- supabase\/schemas supabase\/migrations supabase\/seed /,
  );
});

test("a schema plan is cut after each run of ADD VALUE, so the new value is committed before it is used", () => {
  const add = `ALTER TYPE "p"."s" ADD VALUE 'queued' AFTER 'failed';`;
  const use = `ALTER TABLE "p"."d" ALTER COLUMN "status" SET DEFAULT 'queued'::p."s";`;
  assert.deepEqual(schemaApplySegments(`${add}\n${use}\n`), [
    `${add}\n`,
    `${use}\n`,
  ]);
  // Two values in a row share a transaction; later statements start the next one.
  const add2 = `ALTER TYPE "p"."s" ADD VALUE 'sent';`;
  assert.deepEqual(schemaApplySegments(`${add}\n${add2}\n${use}\n`), [
    `${add}\n${add2}\n`,
    `${use}\n`,
  ]);
  // Order is kept, and work before the first ADD VALUE rides with it.
  const create = `CREATE TABLE "p"."d" ("status" "p"."s");`;
  assert.deepEqual(schemaApplySegments(`${create}\n${add}\n${use}\n`), [
    `${create}\n${add}\n`,
    `${use}\n`,
  ]);
  // No ADD VALUE: one transaction, as before. A body mentioning it is not one.
  const fn = `CREATE FUNCTION f() RETURNS void AS $$ begin alter type x add value 'y'; end $$ LANGUAGE plpgsql;`;
  assert.deepEqual(schemaApplySegments(`${create}\n${fn}\n`), [
    `${create}\n${fn}\n`,
  ]);
  assert.deepEqual(schemaApplySegments(""), []);
});

test("a failed command's error carries stdout as well as stderr", () => {
  const out = commandOutput({
    stderr: "Connecting to remote database...\n",
    stdout: '{"error":{"code":"LegacyDbPushMissingRemoteError"}}\n',
  });
  assert.match(out, /Connecting to remote database/);
  assert.match(out, /LegacyDbPushMissingRemoteError/);
  assert.equal(commandOutput({ stdout: "only out" }), "only out");
  assert.equal(commandOutput({ stderr: "only err", stdout: "" }), "only err");
});

test("a candidate is superseded by a newer commit only when that commit has its own run", async () => {
  const sha = "a".repeat(40);
  const newer = "b".repeat(40);
  const patterns = [
    "apps/slides/**",
    "packages/sdk/**",
    ".gitmodules",
    "pnpm-lock.yaml",
  ];
  const compare =
    (files, status = "ahead", complete = true) =>
    async () => ({
      status,
      files,
      complete,
    });
  // The head itself: fine.
  assert.equal(
    (await evaluateSuperseded({ sha, latest: sha })).superseded,
    false,
  );
  // No path filters (a workflow that runs on every push): any newer commit supersedes.
  assert.equal(
    (await evaluateSuperseded({ sha, latest: newer })).superseded,
    true,
  );
  // An unrelated newer commit has no Slides run, so the approved candidate deploys.
  const unrelated = await evaluateSuperseded({
    sha,
    latest: newer,
    patterns,
    compare: compare(["docs/operations/index.md", "apps/platform/x.ts"]),
  });
  assert.equal(unrelated.superseded, false);
  assert.match(unrelated.message, /no newer run exists/);
  // A newer commit that touches the deck has its own run: this one is superseded, truthfully.
  const related = await evaluateSuperseded({
    sha,
    latest: newer,
    patterns,
    compare: compare(["docs/a.md", "apps/slides/slides.md"]),
  });
  assert.equal(related.superseded, true);
  assert.match(related.message, /apps\/slides\/slides\.md/);
  // Not a straight line, or too many files to read: refuse rather than guess.
  assert.equal(
    (
      await evaluateSuperseded({
        sha,
        latest: newer,
        patterns,
        compare: compare([], "diverged"),
      })
    ).superseded,
    true,
  );
  assert.equal(
    (
      await evaluateSuperseded({
        sha,
        latest: newer,
        patterns,
        compare: compare([], "ahead", false),
      })
    ).superseded,
    true,
  );
});

test("path filters match like GitHub's: ** crosses directories, * does not", () => {
  const files = [
    "apps/slides/a/b.md",
    "apps/slidesx/a.md",
    "pnpm-lock.yaml",
    "x/pnpm-lock.yaml",
    "a/b.ts",
    "a/c/d.ts",
  ];
  assert.deepEqual(matchingPaths(files, ["apps/slides/**"]), [
    "apps/slides/a/b.md",
  ]);
  assert.deepEqual(matchingPaths(files, ["pnpm-lock.yaml"]), [
    "pnpm-lock.yaml",
  ]);
  assert.deepEqual(matchingPaths(files, ["a/*.ts"]), ["a/b.ts"]);
  assert.deepEqual(matchingPaths(files, ["**/pnpm-lock.yaml"]), [
    "pnpm-lock.yaml",
    "x/pnpm-lock.yaml",
  ]);
});

test("slides.yaml's latest_paths are exactly its push path filters", () => {
  const text = readFileSync(
    new URL("../workflows/slides.yaml", import.meta.url),
    "utf8",
  );
  const list = (block) =>
    [...block.matchAll(/^\s+-?\s*(\S.*?)\s*$/gm)]
      .map((m) => m[1])
      .filter(Boolean);
  const pushPaths = /^  push:\n(?:.*\n)*?    paths:\n((?:      - .*\n)+)/m.exec(
    text,
  );
  const latestPaths = /latest_paths: \|\n((?:        .*\n)+)/.exec(text);
  assert.ok(pushPaths && latestPaths, "both lists are present");
  assert.deepEqual(
    list(latestPaths[1]).sort(),
    list(pushPaths[1]).sort(),
    "a drift would let an unrelated commit strand, or a related one skip, a deploy",
  );
});

test("a destructive migration, seed and roles file the producers name differently on each side are still covered", async () => {
  const { uncovered, deployReasons, pullRequestReasons } =
    await import("./destructive-approval.mjs");
  const { root, git } = gitRepo();
  writeFileSync(join(root, "README"), "x");
  git("add", "-A");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "supabase", "seed", "roles"), { recursive: true });
  writeFileSync(
    join(root, "supabase", "migrations", "20261010000000_b.sql"),
    "DROP TABLE tmp_import;",
  );
  writeFileSync(
    join(root, "supabase", "seed", "roles", "x.sql"),
    "delete from platform.roles;",
  );
  writeFileSync(join(root, "supabase", "roles.sql"), "delete from platform.r;");
  git("add", "-A");
  git("commit", "-qm", "head");
  const rt = {
    env: {},
    log: () => {},
    run: (cmd, args, opts) => {
      const r = spawnSync(cmd, args, { cwd: opts?.cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
    },
  };
  const write = (dir, name, classified) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), JSON.stringify({ classified }));
    return dir;
  };
  const prDir = write(
    join(root, "pr"),
    "migrations-change.json",
    changedMigrations(rt, root, base),
  );
  const deployDir = write(join(root, "deploy"), "migrations-plan.json", [
    ...classifyPendingMigrations(root, ["20261010000000_b.sql"]),
    ...classifyPendingSeeds(root, ["seed/roles/x.sql", "roles.sql"]),
  ]);
  const deploy = deployReasons(deployDir);
  assert.equal(deploy.length, 3);
  assert.deepEqual(uncovered(deploy, pullRequestReasons(prDir)), []);
  // A different file with the same statement is still not covered.
  const other = write(join(root, "deploy2"), "migrations-plan.json", [
    {
      file: "20261111000000_c.sql",
      destructive: true,
      reasons: [{ kind: "DROP TABLE", statement: "DROP TABLE tmp_import" }],
    },
  ]);
  assert.equal(
    uncovered(deployReasons(other), pullRequestReasons(prDir)).length,
    1,
  );
});
