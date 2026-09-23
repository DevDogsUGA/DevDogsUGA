// @vitest-environment node
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { teamMembers, teams } from "~/server/db/schema";
import {
  MAX_CONCURRENT_TEAMS_PER_USER,
  MAX_TEAM_SIZE,
} from "~/server/teams/limits";
import {
  githubTeamSlug,
  platformSlugFromGithubTeamSlug,
  teamBranch,
} from "./naming";
import {
  githubLoginFor,
  reconcileTeams,
  type GithubResult,
  type ReconcileGithubClient,
} from "./teamSync";

/**
 * The nightly reconcile against a real database, with a FAKE GitHub client
 * rather than a mock of this module -- the point under test is what
 * `reconcileTeams` writes into the mirror given a GitHub state it did not
 * produce itself, so the client has to be a value the test controls, not a
 * spy on calls the code under test makes.
 *
 * `reconcileTeams` reads the WHOLE `teams` table by design -- it is the
 * nightly pass, every row is in scope in production -- and `test:db` runs
 * every db-test file's own seed data against the same local database at the
 * same time. Without care, this file's fake client would report "nobody is
 * on GitHub" for a team another file seeded concurrently and reconcile would
 * wipe that file's roster out from under it. `fakeClient`'s default for a
 * slug this file did not explicitly configure is therefore a PASS-THROUGH of
 * that team's current mirror state, not an empty list -- a zero diff for
 * every team this file does not care about, and `teamsChecked` is asserted
 * as a lower bound rather than an exact count for the same reason.
 */

const IDS = {
  teamA: "c6666666-6666-6666-6666-666666666601",
  teamB: "c6666666-6666-6666-6666-666666666602",
  teamC: "c6666666-6666-6666-6666-666666666603",
  aLead: "c9966666-6666-6666-6666-666666666601",
  aMirroredLive: "c9966666-6666-6666-6666-666666666602",
  aMirroredGone: "c9966666-6666-6666-6666-666666666603",
  aNewLive: "c9966666-6666-6666-6666-666666666604",
  bLead: "c9966666-6666-6666-6666-666666666605",
  bMemberP: "c9966666-6666-6666-6666-666666666606",
  bMemberQ: "c9966666-6666-6666-6666-666666666607",
  cUser1: "c9966666-6666-6666-6666-666666666608",
  cUser2: "c9966666-6666-6666-6666-666666666609",
  cUser3: "c9966666-6666-6666-6666-666666666610",
  cUser4: "c9966666-6666-6666-6666-666666666611",
  cUser5: "c9966666-6666-6666-6666-666666666612",
  teamD: "c6666666-6666-6666-6666-666666666604",
  teamE: "c6666666-6666-6666-6666-666666666605",
  teamF: "c6666666-6666-6666-6666-666666666606",
  capUser: "c9966666-6666-6666-6666-666666666613",
};

const ALL_TEAMS = [
  IDS.teamA,
  IDS.teamB,
  IDS.teamC,
  IDS.teamD,
  IDS.teamE,
  IDS.teamF,
];
const ALL_USERS = [
  IDS.aLead,
  IDS.aMirroredLive,
  IDS.aMirroredGone,
  IDS.aNewLive,
  IDS.bLead,
  IDS.bMemberP,
  IDS.bMemberQ,
  IDS.cUser1,
  IDS.cUser2,
  IDS.cUser3,
  IDS.cUser4,
  IDS.cUser5,
  IDS.capUser,
];

async function cleanup() {
  await db.execute(
    sql`delete from platform.teams where id in (${sql.join(
      ALL_TEAMS.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`,
  );
  await db.execute(
    sql`delete from auth.users where id in (${sql.join(
      ALL_USERS.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`,
  );
}

function identity(userId: string, login: string) {
  return sql`
    insert into auth.identities (id, user_id, provider, provider_id, identity_data)
    values (gen_random_uuid(), ${userId}::uuid, 'github', ${`${login}-gh`},
            ${JSON.stringify({ sub: `${login}-gh`, user_name: login })}::jsonb)
  `;
}

beforeAll(async () => {
  await cleanup();

  for (const id of ALL_USERS) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`${id}@uga.edu`})
    `);
  }

  await db.execute(identity(IDS.aLead, "reconcile-a-lead"));
  await db.execute(identity(IDS.aMirroredLive, "reconcile-a-mirrored"));
  await db.execute(identity(IDS.aMirroredGone, "reconcile-a-gone"));
  await db.execute(identity(IDS.aNewLive, "reconcile-a-new"));
  // teamB's members deliberately get no identity requirement checked --
  // the GitHub team is gone, so `reconcileTeams` never reads their logins.
  await db.execute(identity(IDS.cUser1, "reconcile-c-1"));
  await db.execute(identity(IDS.cUser2, "reconcile-c-2"));
  await db.execute(identity(IDS.cUser3, "reconcile-c-3"));
  await db.execute(identity(IDS.cUser4, "reconcile-c-4"));
  await db.execute(identity(IDS.cUser5, "reconcile-c-5"));
  await db.execute(identity(IDS.capUser, "reconcile-cap"));

  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values
      (${IDS.teamA}::uuid, 'reconcile-a', 'Reconcile A', 'AAA111', ${IDS.aLead}::uuid),
      (${IDS.teamB}::uuid, 'reconcile-b', 'Reconcile B', 'BBB222', ${IDS.bLead}::uuid),
      (${IDS.teamC}::uuid, 'reconcile-c', 'Reconcile C', 'CCC333', ${IDS.cUser1}::uuid),
      (${IDS.teamD}::uuid, 'reconcile-d', 'Reconcile D', 'DDD444', ${IDS.capUser}::uuid),
      (${IDS.teamE}::uuid, 'reconcile-e', 'Reconcile E', 'EEE555', ${IDS.capUser}::uuid),
      (${IDS.teamF}::uuid, 'reconcile-f', 'Reconcile F', 'FFF666', ${IDS.capUser}::uuid)
  `);

  for (const [teamId, userId] of [
    [IDS.teamA, IDS.aLead],
    [IDS.teamA, IDS.aMirroredLive],
    [IDS.teamA, IDS.aMirroredGone],
    [IDS.teamB, IDS.bLead],
    [IDS.teamB, IDS.bMemberP],
    [IDS.teamB, IDS.bMemberQ],
    // capUser starts mirrored active on two teams already -- exactly at
    // MAX_CONCURRENT_TEAMS_PER_USER -- so the cap test below only has to put
    // them on a THIRD team via GitHub to go over it, the same way a
    // hand-added GitHub membership would in production.
    [IDS.teamD, IDS.capUser],
    [IDS.teamE, IDS.capUser],
  ] as const) {
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "userId", role)
      values (${teamId}::uuid, ${userId}::uuid, 'member')
    `);
  }
});

afterAll(cleanup);

/**
 * The current active roster of a team this file did not seed, read straight
 * back as GitHub's own answer -- see the module doc comment for why a team
 * this test does not recognize must never be told "nobody is on GitHub".
 */
async function currentActiveLogins(githubSlug: string): Promise<string[]> {
  const platformSlug = platformSlugFromGithubTeamSlug(githubSlug);
  if (platformSlug === null) return [];

  const [row] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.slug, platformSlug))
    .limit(1);
  if (!row) return [];

  const roster = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, row.id), isNull(teamMembers.leftAt)));

  const logins: string[] = [];
  for (const member of roster) {
    const login = await githubLoginFor(member.userId);
    if (login) logins.push(login.toLowerCase());
  }
  return logins;
}

function fakeClient(overrides: {
  members: Record<string, string[] | null>;
  branches?: Record<string, boolean>;
  rulesets?: Record<string, boolean>;
  provisioned?: string[];
}): ReconcileGithubClient {
  const provisioned = overrides.provisioned ?? [];
  return {
    teamMembers: (slug) =>
      slug in overrides.members
        ? Promise.resolve(overrides.members[slug] ?? null)
        : currentActiveLogins(slug),
    branchExists: (branch) =>
      Promise.resolve(overrides.branches?.[branch] ?? true),
    rulesetExists: (slug) =>
      Promise.resolve(overrides.rulesets?.[slug] ?? true),
    provisionTeam: (slug): Promise<GithubResult> => {
      provisioned.push(slug);
      return Promise.resolve({ ok: true });
    },
  };
}

async function activeMembers(teamId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(
      sql`${teamMembers.teamId} = ${teamId}::uuid and ${teamMembers.leftAt} is null`,
    );
  return new Set(rows.map((r) => r.userId));
}

async function githubSyncedAt(teamId: string): Promise<Date | null> {
  const [row] = await db
    .select({ githubSyncedAt: teams.githubSyncedAt })
    .from(teams)
    .where(sql`${teams.id} = ${teamId}::uuid`);
  return row?.githubSyncedAt ?? null;
}

describe("reconcileTeams", () => {
  it("repairs the mirror TOWARD GitHub -- adds, closes, recreates, and reports what it cannot fix", async () => {
    const provisioned: string[] = [];

    const report = await reconcileTeams(
      db,
      fakeClient({
        members: {
          [githubTeamSlug("reconcile-a")]: [
            "reconcile-a-lead",
            "reconcile-a-mirrored",
            "reconcile-a-new",
            "reconcile-a-unmatched",
          ],
          [githubTeamSlug("reconcile-b")]: null,
          [githubTeamSlug("reconcile-c")]: [
            "reconcile-c-1",
            "reconcile-c-2",
            "reconcile-c-3",
            "reconcile-c-4",
            "reconcile-c-5",
          ],
        },
        branches: { [teamBranch("reconcile-c")]: false },
        provisioned,
      }),
    );

    // At least this file's own 3 -- possibly more, if another db-test file
    // is concurrently seeded against the same local database.
    expect(report.teamsChecked).toBeGreaterThanOrEqual(3);

    // Team A: GitHub wins the diff. `aMirroredGone` had no matching login in
    // GitHub's member list, so it is closed; `aNewLive` had a login GitHub
    // reports but the mirror never had a row for, so it is opened.
    const teamAActive = await activeMembers(IDS.teamA);
    expect(teamAActive.has(IDS.aLead)).toBe(true);
    expect(teamAActive.has(IDS.aMirroredLive)).toBe(true);
    expect(teamAActive.has(IDS.aMirroredGone)).toBe(false);
    expect(teamAActive.has(IDS.aNewLive)).toBe(true);
    expect(await githubSyncedAt(IDS.teamA)).not.toBeNull();

    // "reconcile-a-unmatched" is a login on GitHub's team with no linked
    // platform identity anywhere -- reported, not repaired.
    expect(report.unmatched).toBe(1);
    expect(
      report.anomalies.some((a) => a.includes("reconcile-a-unmatched")),
    ).toBe(true);

    // Team B: the GitHub team itself is gone. Nobody the mirror called
    // active actually has push access any more, so the whole roster closes,
    // and the team gets reprovisioned (empty) rather than left dangling.
    expect(await activeMembers(IDS.teamB)).toEqual(new Set());
    expect(provisioned).toContain("reconcile-b");
    expect(await githubSyncedAt(IDS.teamB)).not.toBeNull();

    // Team C: the branch was missing, so it gets reprovisioned, and GitHub's
    // five-member roster all get mirrored in even though that puts the team
    // over MAX_TEAM_SIZE -- nobody is kicked, the overrun is reported.
    expect(provisioned).toContain("reconcile-c");
    const teamCActive = await activeMembers(IDS.teamC);
    expect(teamCActive.size).toBe(5);
    expect(
      report.anomalies.some(
        (a) => a.includes("reconcile-c") && a.includes(`${MAX_TEAM_SIZE}`),
      ),
    ).toBe(true);
  });

  it("is idempotent: a second pass against the same GitHub state makes no further changes", async () => {
    const client = fakeClient({
      members: {
        [githubTeamSlug("reconcile-a")]: [
          "reconcile-a-lead",
          "reconcile-a-mirrored",
          "reconcile-a-new",
        ],
        [githubTeamSlug("reconcile-b")]: [],
        [githubTeamSlug("reconcile-c")]: [
          "reconcile-c-1",
          "reconcile-c-2",
          "reconcile-c-3",
          "reconcile-c-4",
          "reconcile-c-5",
        ],
      },
    });

    await reconcileTeams(db, client);
    const before = await activeMembers(IDS.teamA);
    const report = await reconcileTeams(db, client);
    const after = await activeMembers(IDS.teamA);

    expect(after).toEqual(before);
    expect(report.added).toBe(0);
    expect(report.removed).toBe(0);
  });

  it("keeps reporting a member over the concurrent-team cap on every pass, not just the first", async () => {
    // capUser is already mirrored active on teamD and teamE (seeded above);
    // GitHub now also reports them on teamF, a third team, put there by hand
    // outside the platform. teamD/teamE are left off `members` entirely so
    // the fake client's pass-through reports back exactly what is already
    // mirrored for them -- a zero diff -- and teamF is the only thing this
    // pass actually changes.
    const client = fakeClient({
      members: { [githubTeamSlug("reconcile-f")]: ["reconcile-cap"] },
    });

    const first = await reconcileTeams(db, client);
    expect(await activeMembers(IDS.teamF)).toEqual(new Set([IDS.capUser]));
    expect(
      first.anomalies.some(
        (a) =>
          a.includes("reconcile-f") &&
          a.includes(IDS.capUser) &&
          a.includes(`${MAX_CONCURRENT_TEAMS_PER_USER}`),
      ),
    ).toBe(true);

    // Second pass: capUser is no longer newly added to teamF -- they were
    // mirrored in by the pass above -- but they are still active on 3 teams,
    // so the standing violation must be reported again, not silently dropped
    // now that they are old news to the mirror.
    const second = await reconcileTeams(db, client);
    expect(
      second.anomalies.some(
        (a) =>
          a.includes("reconcile-f") &&
          a.includes(IDS.capUser) &&
          a.includes(`${MAX_CONCURRENT_TEAMS_PER_USER}`),
      ),
    ).toBe(true);
  });
});
