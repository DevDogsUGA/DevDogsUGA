import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The minting flow, with everything remote faked: the admin connection, the
 * planner verification connection, the filesystem, and the confirm prompt.
 *
 * What only this layer can get wrong, and what each test pins:
 *
 *   * the admin URL comes from `.env.production`'s FILE, not the ambient env;
 *   * `create` refuses an existing role instead of repairing it in place;
 *   * the CREATE and the GRANTs run against the ADMIN connection, and the
 *     verification runs against a SECOND connection as the planner;
 *   * the composed DB_URL lands in `.env.preflight` and nowhere else, and the
 *     admin password does not travel into it.
 */
const files = vi.hoisted(() => ({
  map: new Map<string, string>(),
  written: new Map<string, string>(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (path: string) => {
    const hit = [...files.map.entries()].find(([name]) =>
      String(path).endsWith(name),
    );
    if (!hit) throw new Error(`ENOENT: ${String(path)}`);
    return hit[1];
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    files.written.set(String(path), content);
  }),
}));

const prompts = vi.hoisted(() => ({
  confirmed: true,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock("@clack/prompts", () => ({
  log: prompts.log,
  note: vi.fn(),
  confirm: vi.fn(async () => prompts.confirmed),
  isCancel: () => false,
  cancel: vi.fn(),
}));

// `bail()` calls process.exit; the tests need the refusal, not the exit.
vi.mock("../ui.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ui.js")>()),
  bail: vi.fn((message = "Cancelled."): never => {
    throw new Error(`bail: ${message}`);
  }),
}));

import { CHECK_IDENTITY, CHECK_MIGRATIONS, CHECK_OVERREACH } from "./checks.js";
import type { PlannerDb } from "./db.js";
import { runPlannerCreate, runPlannerResetPassword } from "./commands.js";

const ADMIN_URL =
  "postgresql://postgres.ref:admin-secret@pooler.example.com:5432/postgres";

interface Fake {
  connect: (url: string) => PlannerDb;
  urls: string[];
  statements: string[];
}

/** Admin connections answer role queries; planner ones answer the checks. */
function fake(roleExists: boolean, schemaExists = true): Fake {
  const urls: string[] = [];
  const statements: string[] = [];
  return {
    urls,
    statements,
    connect: (url: string) => {
      urls.push(url);
      return fakeDb(url);
    },
  };

  function fakeDb(url: string): PlannerDb {
    return {
      async run(query: string) {
        if (url.startsWith("postgresql://migration_planner")) {
          if (query === CHECK_IDENTITY) return [{ who: "migration_planner" }];
          if (query === CHECK_OVERREACH) {
            throw new Error("permission denied for schema platform");
          }
          if (query === CHECK_MIGRATIONS) return [{ n: 1 }];
          throw new Error(`unexpected planner query: ${query}`);
        }
        if (query.includes("from pg_roles where")) {
          return roleExists ? [{ rolcanlogin: true }] : [];
        }
        if (query.includes("from pg_namespace where")) {
          return schemaExists ? [{ "?column?": 1 }] : [];
        }
        statements.push(query);
        return [];
      },
      async end() {},
    };
  }
}

beforeEach(() => {
  files.map.clear();
  files.written.clear();
  files.map.set(".env.production", `DB_URL="${ADMIN_URL}"\n`);
  files.map.set(".env.preflight", 'DB_URL=""\n');
  prompts.confirmed = true;
});

afterEach(() => {
  vi.clearAllMocks();
});

function preflightWrite(): string {
  const hit = [...files.written.entries()].find(([path]) =>
    path.endsWith(".env.preflight"),
  );
  expect(hit, "nothing was written to .env.preflight").toBeDefined();
  return hit![1];
}

describe("planner create", () => {
  it("creates the role on the admin connection, verifies as the planner, writes .env.preflight", async () => {
    const harness = fake(false);
    await runPlannerCreate({ connect: harness.connect });

    // The CREATE and both GRANTs, in order, in ONE transaction on the admin
    // connection — a mid-flight failure must leave no grant-less role behind
    // for the already-exists refusal to protect.
    expect(harness.statements[0]).toBe("begin");
    expect(harness.statements[1]).toMatch(
      /^create role migration_planner login password '[A-Za-z0-9_-]{32}'$/,
    );
    expect(harness.statements.slice(2)).toEqual([
      "grant usage on schema supabase_migrations to migration_planner",
      "grant select on supabase_migrations.schema_migrations to migration_planner",
      "commit",
    ]);

    // A SECOND connection, as the planner, against the same host.
    expect(
      harness.urls.some((u) =>
        u.startsWith("postgresql://migration_planner.ref:"),
      ),
    ).toBe(true);

    // The composed URL lands in the preflight file; the admin secret does not.
    const written = preflightWrite();
    expect(written).toMatch(/DB_URL="postgresql:\/\/migration_planner\.ref:/);
    expect(written).not.toContain("admin-secret");
  });

  it("refuses an existing role rather than repairing it in place", async () => {
    // An existing role may hold grants this command did not give it, and
    // layering the validated pair on top would report success over an
    // unvalidated whole.
    const harness = fake(true);
    await expect(
      runPlannerCreate({ connect: harness.connect }),
    ).rejects.toThrow(/already exists/);
    expect(harness.statements).toEqual([]);
    expect(files.written.size).toBe(0);
  });

  it("stops at the confirm — production writes are opt-in per run", async () => {
    prompts.confirmed = false;
    const harness = fake(false);
    await expect(
      runPlannerCreate({ connect: harness.connect }),
    ).rejects.toThrow(/bail/);
    expect(harness.urls).toEqual([]);
  });

  it("refuses a database with no migration history, BEFORE creating anything", async () => {
    // The failure that shaped this: on a database the CLI has never
    // migrated, CREATE ROLE succeeded and the first GRANT failed on the
    // missing schema — stranding a grant-less role behind the
    // already-exists refusal. The precondition has to fire first.
    const harness = fake(false, false);
    await expect(
      runPlannerCreate({ connect: harness.connect }),
    ).rejects.toThrow(/supabase_migrations schema does not exist/);
    expect(harness.statements).toEqual([]);
    expect(files.written.size).toBe(0);
    // And the message names the two ways history comes to exist.
    await expect(
      runPlannerCreate({ connect: harness.connect }),
    ).rejects.toThrow(/db push|migration repair/);
  });

  it("refuses to run with no admin URL, naming both ways to supply one", async () => {
    files.map.set(".env.production", "");
    const harness = fake(false);
    await expect(
      runPlannerCreate({ connect: harness.connect }),
    ).rejects.toThrow(/env pull --target production|--db-url/);
  });
});

describe("planner reset-password", () => {
  it("alters the password and rewrites .env.preflight, touching no grants", async () => {
    const harness = fake(true);
    await runPlannerResetPassword({ connect: harness.connect });

    expect(harness.statements).toHaveLength(1);
    expect(harness.statements[0]).toMatch(
      /^alter role migration_planner password '[A-Za-z0-9_-]{32}'$/,
    );
    preflightWrite();
  });

  it("refuses when the role does not exist, pointing at create", async () => {
    const harness = fake(false);
    await expect(
      runPlannerResetPassword({ connect: harness.connect }),
    ).rejects.toThrow(/planner create/);
    expect(harness.statements).toEqual([]);
  });
});
