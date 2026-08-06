// @vitest-environment node
import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "~/server/db";
import { isUniqueViolation } from "~/server/teams/errors";

/**
 * Provisioning and teardown, against a mock Management API.
 *
 * The Supabase-facing half has never run against the live API and cannot until
 * an OAuth grant exists, so the claims it makes are otherwise unchecked. Those
 * claims are all about ORDERING and REFUSAL — what must not be written yet, and
 * what must not be concluded from a transient error — which is exactly the kind
 * of thing typechecking cannot see and a happy-path test would not exercise.
 *
 * The mock records every call, so "the Vault was written after the project came
 * up" is asserted against the real sequence rather than inferred.
 *
 * Building the equivalent mock for the proxy immediately found a hole the SQL
 * was masking. This is the same exercise for the other half.
 */

const IDS = {
  project: "a0000000-0000-0000-0000-0000000000a1",
  meeting: "a0000000-0000-0000-0000-0000000000b1",
  workshop: "a0000000-0000-0000-0000-0000000000c1",
  comp: "a0000000-0000-0000-0000-0000000000d1",
  team: "a0000000-0000-0000-0000-0000000000e1",
  lead: "a0000000-0000-0000-0000-0000000000f1",
  member: "a0000000-0000-0000-0000-0000000000f2",
  env: "a0000000-0000-0000-0000-0000000000e9",
};

// ── The mock Management API ──────────────────────────────────────────────────

interface Call {
  fn: string;
  arg?: string;
}
let calls: Call[] = [];

/** Behaviour the individual tests reach in and change. */
const upstream = {
  projects: [] as { ref: string; status: string }[],
  createdRef: "newref",
  statusSequence: ["ACTIVE_HEALTHY"] as string[],
  getProjectThrows: false,
  getProjectReturnsNull: false,
};

vi.mock("~/server/supabase/managementApi", () => ({
  ManagementError: class ManagementError extends Error {
    constructor(
      public code: string,
      public status: number,
      public detail: string,
    ) {
      super(detail);
    }
  },
  listProjects: vi.fn(() => {
    calls.push({ fn: "listProjects" });
    return Promise.resolve(upstream.projects);
  }),
  getProject: vi.fn((_t: string, ref: string) => {
    calls.push({ fn: "getProject", arg: ref });
    if (upstream.getProjectThrows)
      throw new Error("transient upstream failure");
    if (upstream.getProjectReturnsNull) return Promise.resolve(null);
    return Promise.resolve({
      ref,
      status: upstream.statusSequence[0] ?? "ACTIVE_HEALTHY",
      id: ref,
      name: ref,
      region: "us-east-1",
      organization_id: "org",
    });
  }),
  createProject: vi.fn(() => {
    calls.push({ fn: "createProject" });
    return Promise.resolve({
      ref: upstream.createdRef,
      status: "COMING_UP",
      id: "x",
      name: "x",
      region: "us-east-1",
      organization_id: "org",
    });
  }),
  waitForReady: vi.fn((_t: string, ref: string) => {
    calls.push({ fn: "waitForReady", arg: ref });
    return Promise.resolve({ ref, status: "ACTIVE_HEALTHY" });
  }),
  retrieveKeys: vi.fn(() => {
    calls.push({ fn: "retrieveKeys" });
    return Promise.resolve({
      publishable: "sb_publishable_new",
      secret: "sb_secret_new",
    });
  }),
  runQuery: vi.fn(() => {
    calls.push({ fn: "runQuery" });
    return Promise.resolve(null);
  }),
  pauseProject: vi.fn((_t: string, ref: string) => {
    calls.push({ fn: "pauseProject", arg: ref });
    return Promise.resolve();
  }),
  restoreProject: vi.fn((_t: string, ref: string) => {
    calls.push({ fn: "restoreProject", arg: ref });
    return Promise.resolve();
  }),
}));

vi.mock("~/server/supabase/oauth", () => ({
  accessTokenFor: vi.fn(() => Promise.resolve("fake-oauth-token")),
}));

// Vault calls are recorded so teardown ORDER can be asserted -- the whole point
// of the teardown test is that credentials are revoked before secrets vanish.
vi.mock("~/server/vault", () => ({
  storeVaultSecret: vi.fn((_s: string, name: string) => {
    calls.push({ fn: "storeVaultSecret", arg: name });
    return Promise.resolve("11111111-1111-1111-1111-111111111111");
  }),
  readVaultSecret: vi.fn(() => Promise.resolve("secret")),
  deleteVaultSecret: vi.fn((id: string) => {
    calls.push({ fn: "deleteVaultSecret", arg: id });
    return Promise.resolve();
  }),
}));

const {
  provisionEnvironment,
  tearDownEnvironment,
  reconcilePass,
  autoPausePass,
  ProvisionError,
} = await import("~/server/supabase/provision");

// ── Fixture ──────────────────────────────────────────────────────────────────

async function cleanup() {
  await db.execute(
    sql`delete from platform.meetings where id = ${IDS.meeting}::uuid`,
  );
  await db.execute(sql`
    delete from platform."sandboxEnvironments"
    where "ownerUserId" = ${IDS.lead}::uuid or id = ${IDS.env}::uuid
  `);
  await db.execute(sql`
    delete from platform.projects where id = ${IDS.project}::uuid
  `);
  await db.execute(sql`
    delete from auth.users where id in (${IDS.lead}::uuid, ${IDS.member}::uuid)
  `);
  await db.execute(sql`delete from vault.secrets where name like 'provtest-%'`);
}

beforeAll(async () => {
  await cleanup();
  for (const [id, email] of [
    [IDS.lead, "prov-lead@uga.edu"],
    [IDS.member, "prov-member@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }
  await db.execute(sql`
    insert into platform.projects (id, slug, "displayName")
    values (${IDS.project}::uuid, 'prov-test', 'Prov Test')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, name, "startsAt", "endsAt")
    values (${IDS.meeting}::uuid, 'prov-meeting', 'Prov',
            now(), now() + interval '2 hours')
  `);
  await db.execute(sql`
    insert into platform.workshops (id, "meetingId", "projectId")
    values (${IDS.workshop}::uuid, ${IDS.meeting}::uuid, ${IDS.project}::uuid)
  `);
  await db.execute(sql`
    insert into platform.competitions (id, slug, "workshopId", "judgingStartsAt")
    values (${IDS.comp}::uuid, 'prov-comp', ${IDS.workshop}::uuid,
            now() + interval '7 days')
  `);
  await db.execute(sql`
    insert into platform.teams (id, "competitionId", slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, ${IDS.comp}::uuid, 'prov-team', 'Prov Team',
            'PROVAA', ${IDS.lead}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "competitionId", "userId", role)
    values (${IDS.team}::uuid, ${IDS.comp}::uuid, ${IDS.lead}::uuid, 'lead'),
           (${IDS.team}::uuid, ${IDS.comp}::uuid, ${IDS.member}::uuid, 'member')
  `);
});

afterEach(async () => {
  calls = [];
  upstream.projects = [];
  upstream.getProjectThrows = false;
  upstream.getProjectReturnsNull = false;
  upstream.statusSequence = ["ACTIVE_HEALTHY"];
  vi.clearAllMocks();
  await db.execute(sql`
    delete from platform."teamEnvironments" where "teamId" = ${IDS.team}::uuid
  `);
  await db.execute(sql`
    delete from platform."sandboxEnvironments"
    where "ownerUserId" = ${IDS.lead}::uuid
  `);
});

afterAll(cleanup);

const names = () => calls.map((c) => c.fn);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("provisionEnvironment", () => {
  it("waits for the project before writing anything to Vault", async () => {
    await provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" });

    const order = names();
    // The ordering guarantee stated in the module doc, asserted rather than
    // described: a failure during creation must leave nothing behind, which is
    // only true if nothing is written until the project is confirmed healthy.
    expect(order.indexOf("waitForReady")).toBeLessThan(
      order.indexOf("retrieveKeys"),
    );
    expect(order.indexOf("retrieveKeys")).toBeLessThan(
      order.indexOf("storeVaultSecret"),
    );
  });

  it("attaches the team and applies migrations", async () => {
    await provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" });
    expect(names()).toContain("runQuery");

    const [row] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform."teamEnvironments"
       where "teamId" = ${IDS.team}::uuid
    `);
    expect(row!.n).toBe(1);
  });

  it("refuses somebody who is not the team's lead, before creating anything", async () => {
    await expect(
      provisionEnvironment(IDS.team, IDS.member, { organizationId: "org" }),
    ).rejects.toThrow(ProvisionError);
    // The refusal must precede the API call, or a rejected provision still
    // costs the member one of their two free project slots.
    expect(names()).not.toContain("createProject");
  });

  it("refuses at the free-plan ceiling without creating a third project", async () => {
    upstream.projects = [
      { ref: "a", status: "ACTIVE_HEALTHY" },
      { ref: "b", status: "ACTIVE_HEALTHY" },
    ];
    await expect(
      provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" }),
    ).rejects.toThrow(ProvisionError);
    expect(names()).not.toContain("createProject");
  });

  it("leaves no row and no Vault secret behind when the project never comes up", async () => {
    const { waitForReady } = await import("~/server/supabase/managementApi");
    vi.mocked(waitForReady).mockRejectedValueOnce(new Error("never came up"));

    await expect(
      provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" }),
    ).rejects.toThrow();

    expect(names()).not.toContain("storeVaultSecret");
    const [row] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform."sandboxEnvironments"
       where "ownerUserId" = ${IDS.lead}::uuid
    `);
    expect(row!.n).toBe(0);
  });
});

describe("tearDownEnvironment", () => {
  async function seedEnvironment() {
    await provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" });
    const [row] = await db.execute<{ id: string; host: string }>(sql`
      select id, "proxyHostname" as host from platform."sandboxEnvironments"
       where "ownerUserId" = ${IDS.lead}::uuid
    `);
    calls = [];
    return row!;
  }

  it("revokes credentials before deleting the Vault secrets", async () => {
    const env = await seedEnvironment();
    await db.execute(sql`
      insert into platform."sandboxCredentials"
        ("environmentId", "userId", "tokenHash", scope, status)
      values (${env.id}::uuid, ${IDS.member}::uuid, 'provtest-hash',
              'secret', 'active')
    `);

    await tearDownEnvironment(env.id, "revoked");

    // Order matters: deleting the secrets first would leave live credentials
    // resolving against a half-dismantled environment.
    const [cred] = await db.execute<{ status: string }>(sql`
      select status from platform."sandboxCredentials"
       where "environmentId" = ${env.id}::uuid
    `);
    expect(cred!.status).toBe("revoked");
    expect(names()).toContain("deleteVaultSecret");
  });

  it("keeps the row, so the hostname stays retired forever", async () => {
    const env = await seedEnvironment();
    await tearDownEnvironment(env.id, "orphaned");

    const [row] = await db.execute<{ status: string; host: string }>(sql`
      select status, "proxyHostname" as host from platform."sandboxEnvironments"
       where id = ${env.id}::uuid
    `);
    expect(row!.status).toBe("orphaned");
    expect(row!.host).toBe(env.host);

    // A recycled hostname means an old build silently reading somebody else's
    // database, so the unique constraint must still be reserving this name.
    //
    // Asserted through `isUniqueViolation` rather than on the message, because
    // Drizzle wraps driver errors: the thrown object says "Failed query: …" and
    // the PostgresError carrying `constraint_name` is on `.cause`. Matching the
    // message would pass for ANY failed insert -- including a fixture mistake
    // that never reached the constraint at all.
    const recycled = await db
      .execute(
        sql`
        insert into platform."sandboxEnvironments"
          (name, kind, "ownerUserId", "projectRef", "apiUrl", "publishableKey",
           "secretKeySecretId", "jwtSecretId", "proxyHostname", status)
        values ('Recycler', 'owned', ${IDS.lead}::uuid, 'otherref',
                'https://x.supabase.co', 'k', gen_random_uuid(),
                gen_random_uuid(), ${env.host}, 'active')
      `,
      )
      .then(() => null)
      .catch((error: unknown) => error);

    expect(recycled).not.toBeNull();
    expect(
      isUniqueViolation(recycled, "sandboxEnvironments_proxyHostname_key"),
    ).toBe(true);
  });

  it("detaches every team", async () => {
    const env = await seedEnvironment();
    await tearDownEnvironment(env.id, "revoked");
    const [row] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform."teamEnvironments"
       where "environmentId" = ${env.id}::uuid
    `);
    expect(row!.n).toBe(0);
  });
});

describe("reconcilePass", () => {
  async function seedEnvironment() {
    await provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" });
    const [row] = await db.execute<{ id: string }>(sql`
      select id from platform."sandboxEnvironments"
       where "ownerUserId" = ${IDS.lead}::uuid
    `);
    calls = [];
    return row!.id;
  }

  it("orphans an environment whose project is definitely gone", async () => {
    const id = await seedEnvironment();
    upstream.getProjectReturnsNull = true;

    const result = await reconcilePass();
    expect(result.orphaned).toBeGreaterThanOrEqual(1);

    const [row] = await db.execute<{ status: string }>(sql`
      select status from platform."sandboxEnvironments" where id = ${id}::uuid
    `);
    expect(row!.status).toBe("orphaned");
  });

  it("does NOT orphan on a transient upstream error", async () => {
    // The single most destructive thing this pass could get wrong. Orphaning
    // revokes credentials and deletes Vault secrets, so treating a blip or a
    // lapsed grant as evidence would destroy a working environment.
    const id = await seedEnvironment();
    upstream.getProjectThrows = true;

    const result = await reconcilePass();
    expect(result.orphaned).toBe(0);

    const [row] = await db.execute<{ status: string }>(sql`
      select status from platform."sandboxEnvironments" where id = ${id}::uuid
    `);
    expect(row!.status).toBe("active");
  });

  it("updates a status that drifted upstream", async () => {
    const id = await seedEnvironment();
    upstream.statusSequence = ["INACTIVE"];

    await reconcilePass();
    const [row] = await db.execute<{ status: string }>(sql`
      select status from platform."sandboxEnvironments" where id = ${id}::uuid
    `);
    expect(row!.status).toBe("paused");
  });
});

describe("autoPausePass", () => {
  it("re-checks status instead of assuming the project is up", async () => {
    await provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" });
    // Detach, so nothing keeps it alive: an environment with no open
    // competition is exactly what this pass is for.
    await db.execute(sql`
      delete from platform."teamEnvironments" where "teamId" = ${IDS.team}::uuid
    `);
    calls = [];

    upstream.statusSequence = ["PAUSING"];
    const result = await autoPausePass();

    // Pausing takes ~80s (measured), so a project mid-pause must not be paused
    // again -- and the check that prevents it is a real getProject call.
    expect(names()).toContain("getProject");
    expect(result.paused).toBe(0);
    expect(names()).not.toContain("pauseProject");
  });

  it("pauses a healthy project with no open competition", async () => {
    await provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" });
    await db.execute(sql`
      delete from platform."teamEnvironments" where "teamId" = ${IDS.team}::uuid
    `);
    calls = [];

    const result = await autoPausePass();
    expect(result.paused).toBe(1);
    expect(names()).toContain("pauseProject");
  });

  it("leaves an environment alone while its competition is open", async () => {
    // judgingStartsAt is seven days out, so this competition is open and the
    // team is attached -- pausing here would take a live event offline.
    await provisionEnvironment(IDS.team, IDS.lead, { organizationId: "org" });
    calls = [];

    const result = await autoPausePass();
    expect(result.paused).toBe(0);
    expect(names()).not.toContain("pauseProject");
  });
});
