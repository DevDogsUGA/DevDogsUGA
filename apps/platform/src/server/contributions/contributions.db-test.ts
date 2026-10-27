// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  getContributionsForUser,
  getMergedPrsPerWeek,
} from "~/server/loaders/contributions";
import { getPublicProfileActivity } from "~/server/loaders/publicProfiles";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import type { MergedPullRequest } from "./pullRequest";
import { recordContribution } from "./store";

/**
 * `platform.contributions`: ingestion, matching by GitHub user id, the claim
 * when a member links GitHub later, account deletion (the member's rows go
 * with the account), who can read the table, and what a public profile shows.
 * Fixture ids are all `fc...` and swept before and after every test.
 */

const id = (n: number) =>
  `fc000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const A = id(1);
const B = id(2);
const ALL = [A, B] as const;
const REPO = "DevDogsUGA/contrib-dbtest";
const GH_A = "9100000001";

function pr(overrides: Partial<MergedPullRequest> = {}): MergedPullRequest {
  return {
    repo: REPO,
    repoPrivate: false,
    number: 1,
    title: "Add the thing",
    url: `https://github.com/${REPO}/pull/1`,
    mergedAt: new Date("2026-10-14T15:00:00Z"),
    authorGithubId: GH_A,
    authorLogin: "contrib-a",
    ...overrides,
  };
}

async function cleanup() {
  await db.execute(
    sql`delete from platform.contributions where repo like 'DevDogsUGA/contrib-dbtest%'`,
  );
  await deleteMembers(ALL);
}

beforeEach(cleanup);
afterAll(cleanup);

/** A member without a GitHub identity; `linkGithub` adds one. */
async function member(memberId: string, handle: string) {
  await insertMember({ id: memberId, handle, github: null });
}

async function linkGithub(userId: string, githubId: string, login: string) {
  await db.execute(sql`
    insert into auth.identities (id, user_id, provider, provider_id, identity_data)
    values (gen_random_uuid(), ${userId}::uuid, 'github', ${githubId},
            ${JSON.stringify({ user_name: login })}::jsonb)
  `);
}

async function rows() {
  return db.execute<{ userId: string | null; deliveryId: string | null }>(sql`
    select "userId", "deliveryId" from platform.contributions
    where repo like 'DevDogsUGA/contrib-dbtest%' order by "prNumber"
  `);
}

describe("recordContribution", () => {
  it("matches the member by GitHub user id", async () => {
    await member(A, "contrib-a");
    await linkGithub(A, GH_A, "someone-else-now");
    expect(await recordContribution(pr(), "d-1")).toBe("recorded");
    expect((await rows())[0]!.userId).toBe(A);
  });

  it("never matches by login", async () => {
    await member(A, "contrib-a");
    // The member's GitHub login equals the PR author's, but the id differs.
    await linkGithub(A, "9100000099", "contrib-a");
    await recordContribution(pr(), "d-1");
    expect((await rows())[0]!.userId).toBeNull();
  });

  it("keeps an unmatched author with a null userId", async () => {
    await recordContribution(pr(), "d-1");
    const [row] = await rows();
    expect(row!.userId).toBeNull();
  });

  it("is idempotent on the delivery id and on repo and PR number", async () => {
    expect(await recordContribution(pr(), "d-1")).toBe("recorded");
    expect(await recordContribution(pr(), "d-1")).toBe("duplicate");
    expect(await recordContribution(pr(), "d-2")).toBe("duplicate");
    expect(await recordContribution(pr(), null)).toBe("duplicate");
    expect(await rows()).toHaveLength(1);
    expect(await recordContribution(pr({ number: 2 }), null)).toBe("recorded");
    expect(await recordContribution(pr({ number: 3 }), null)).toBe("recorded");
    expect(await rows()).toHaveLength(3);
  });
});

describe("claiming on a later GitHub link", () => {
  it("assigns the unmatched rows for that GitHub id to the member", async () => {
    await member(A, "contrib-a");
    await member(B, "contrib-b");
    await recordContribution(pr({ number: 1 }), "d-1");
    await recordContribution(
      pr({ number: 2, authorGithubId: "9100000002", authorLogin: "other" }),
      "d-2",
    );
    expect((await rows()).map((r) => r.userId)).toEqual([null, null]);

    await linkGithub(A, GH_A, "contrib-a");

    expect((await rows()).map((r) => r.userId)).toEqual([A, null]);
  });

  it("does not take a row already matched to someone else", async () => {
    await member(A, "contrib-a");
    await member(B, "contrib-b");
    await linkGithub(A, GH_A, "contrib-a");
    await recordContribution(pr(), "d-1");
    // A second member cannot link the same GitHub id (identities are unique
    // per provider id), and a non-GitHub identity never claims.
    await db.execute(sql`
      insert into auth.identities (id, user_id, provider, provider_id, identity_data)
      values (gen_random_uuid(), ${B}::uuid, 'discord', ${GH_A}, '{}'::jsonb)
    `);
    expect((await rows())[0]!.userId).toBe(A);
  });
});

describe("account deletion", () => {
  it("deletes the member's rows with the account and keeps unmatched ones", async () => {
    await member(A, "contrib-a");
    await linkGithub(A, GH_A, "contrib-a");
    await recordContribution(pr({ number: 1 }), "d-1");
    await recordContribution(
      pr({ number: 2, authorGithubId: "9100000002", authorLogin: "other" }),
      "d-2",
    );
    expect((await rows()).map((r) => r.userId)).toEqual([A, null]);

    await deleteMembers([A]);

    expect((await rows()).map((r) => r.userId)).toEqual([null]);
  });
});

describe("access", () => {
  it("is invisible and unwritable to anon and authenticated", async () => {
    await member(A, "contrib-a");
    await recordContribution(pr(), "d-1");
    for (const role of ["anon", "authenticated"] as const) {
      const outcome = await db
        .transaction(async (tx) => {
          await tx.execute(
            sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: A, role })}, true)`,
          );
          await tx.execute(sql`set local role ${sql.raw(role)}`);
          await tx.execute(sql`select 1 from platform.contributions`);
        })
        .then(
          () => "allowed",
          () => "denied",
        );
      expect(outcome).toBe("denied");
    }
  });
});

describe("loaders", () => {
  it("lists newest first, and leaves private repositories off public lists", async () => {
    await member(A, "contrib-a");
    await linkGithub(A, GH_A, "contrib-a");
    await recordContribution(
      pr({ number: 1, mergedAt: new Date("2026-10-01T12:00:00Z") }),
      null,
    );
    await recordContribution(
      pr({
        number: 2,
        repo: `${REPO}-private`,
        repoPrivate: true,
        mergedAt: new Date("2026-10-20T12:00:00Z"),
      }),
      null,
    );
    await recordContribution(
      pr({ number: 3, mergedAt: new Date("2026-10-10T12:00:00Z") }),
      null,
    );

    const own = await getContributionsForUser(A, { publicOnly: false });
    expect(own.map((c) => c.number)).toEqual([2, 3, 1]);
    const pub = await getContributionsForUser(A, { publicOnly: true });
    expect(pub.map((c) => c.number)).toEqual([3, 1]);
  });

  it("counts merged PRs per club week, private included", async () => {
    await member(A, "contrib-a");
    await linkGithub(A, GH_A, "contrib-a");
    // Mon Oct 12 and Tue Oct 13 share a week; Oct 20 starts the next.
    await recordContribution(
      pr({ number: 1, mergedAt: new Date("2026-10-12T16:00:00Z") }),
      null,
    );
    await recordContribution(
      pr({ number: 2, mergedAt: new Date("2026-10-13T16:00:00Z") }),
      null,
    );
    await recordContribution(
      pr({
        number: 3,
        repoPrivate: true,
        mergedAt: new Date("2026-10-20T16:00:00Z"),
      }),
      null,
    );
    expect(await getMergedPrsPerWeek(A)).toEqual([
      { week: "2026-10-12", merged: 2 },
      { week: "2026-10-19", merged: 1 },
    ]);
  });

  it("shows on a public profile only while the member shows contributions", async () => {
    await member(A, "contrib-a");
    await linkGithub(A, GH_A, "contrib-a");
    await recordContribution(pr(), null);

    const shown = await getPublicProfileActivity("contrib-a");
    expect(shown?.contributions?.map((c) => c.number)).toEqual([1]);

    await db.execute(
      sql`update platform.profile set "showContributions" = false where "userId" = ${A}::uuid`,
    );
    expect((await getPublicProfileActivity("contrib-a"))?.contributions).toBe(
      null,
    );

    await db.execute(
      sql`update platform.profile set "showContributions" = true, "publicProfile" = false where "userId" = ${A}::uuid`,
    );
    expect(await getPublicProfileActivity("contrib-a")).toBeNull();
  });
});
