// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";
import { db } from "~/server/db";
import { saveRepo } from "~/server/github/store";
import type { Repo } from "~/server/github/repos";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import { createDocsStore } from "./docsStore";
import type { NewProposal, ProposalRow } from "./docsProposals";

/**
 * The docs proposals' SQL against Postgres: the one-in-flight rule, what a
 * merged pull request does to the project, the pause that only lifts for the
 * confirmed owner, and the first-publication write-once. The rules around them
 * are `docsProposals.test.ts`'s.
 */

const MEMBER = "e1000000-0000-4000-a000-000000000001";
const PROJECT = "e1000000-0000-4000-a000-000000000002";
const OTHER = "e1000000-0000-4000-a000-000000000003";
const PROPOSAL = "e1000000-0000-4000-a000-000000000011";
const SECOND = "e1000000-0000-4000-a000-000000000012";
const REPO_ID = "91910001";
const SLUG = "e1-docs-fixture";
const SHA = "e1" + "0".repeat(38);

const repo: Repo = {
  id: Number(REPO_ID),
  private: false,
  name: "docs-fixture",
  owner: { id: 191, login: "fixture-owner", type: "Organization" },
  default_branch: "main",
};

const store = createDocsStore();

function proposal(over: Partial<NewProposal> = {}): NewProposal {
  return {
    id: PROPOSAL,
    projectId: PROJECT,
    requestedBy: MEMBER,
    enable: true,
    githubRepoId: REPO_ID,
    ownerId: "191",
    slug: SLUG,
    baseSha: SHA,
    ...over,
  };
}

async function projectRow() {
  const [row] = await db.execute<{
    docsRepoId: string | null;
    docsRequested: boolean;
    paused: boolean;
    confirmedOwner: string | null;
    confirmedBy: string | null;
    published: boolean;
    slug: string | null;
  }>(sql`
    select "docsRepoId"::text as "docsRepoId", "docsRequested",
           "docsPausedAt" is not null as paused,
           "docsConfirmedOwnerId"::text as "confirmedOwner",
           "docsConfirmedBy"::text as "confirmedBy",
           "docsFirstPublishedAt" is not null as published, slug
    from platform.projects where id = ${PROJECT}::uuid`);
  return row!;
}

async function proposalRow(id = PROPOSAL) {
  const [row] = await db.execute<{
    state: string;
    prNumber: number | null;
    prUrl: string | null;
    baseSha: string;
    lastError: string | null;
  }>(
    sql`select state, "prNumber", "prUrl", "baseSha", "lastError" from platform."projectDocsProposals" where id = ${id}::uuid`,
  );
  return row;
}

async function inFlight(): Promise<ProposalRow[]> {
  return store.inFlight(50);
}

async function cleanup() {
  await db.execute(
    sql`delete from platform."auditEvents" where "targetId" = ${PROJECT}`,
  );
  await db.execute(
    sql`delete from platform."projectDocsProposals" where "projectId" in (${PROJECT}::uuid, ${OTHER}::uuid)`,
  );
  await db.execute(
    sql`update platform.projects set "docsRepoId" = null where id in (${PROJECT}::uuid, ${OTHER}::uuid)`,
  );
  await db.execute(
    sql`delete from platform."projectRepos" where "projectId" in (${PROJECT}::uuid, ${OTHER}::uuid)`,
  );
  await db.execute(
    sql`delete from platform.projects where id in (${PROJECT}::uuid, ${OTHER}::uuid)`,
  );
  await db.execute(
    sql`delete from platform."githubRepos" where "githubRepoId" = ${REPO_ID}::bigint`,
  );
  await deleteMembers([MEMBER]);
}

beforeEach(async () => {
  await cleanup();
  await insertMember({ id: MEMBER });
  await saveRepo(repo);
  await db.execute(
    sql`insert into platform.projects (id, name, slug) values (${PROJECT}::uuid, 'E1 docs fixture', ${SLUG})`,
  );
  await db.execute(
    sql`insert into platform."projectRepos" ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt") values (${PROJECT}::uuid, ${REPO_ID}::bigint, 'approved', 'devdogs-write', 191, now())`,
  );
});
afterAll(cleanup);

describe("loading a project for a docs change", () => {
  it("returns the project and its linked repositories with what the cache says about them", async () => {
    const loaded = await store.loadProject(PROJECT);
    expect(loaded?.project).toMatchObject({
      id: PROJECT,
      slug: SLUG,
      docsRepoId: null,
      docsRequested: false,
      docsPausedAt: null,
    });
    expect(loaded?.repos).toEqual([
      {
        githubRepoId: REPO_ID,
        ownerId: "191",
        owner: "fixture-owner",
        name: "docs-fixture",
        approved: true,
        available: true,
      },
    ]);
    await db.execute(
      sql`update platform."githubRepos" set health = 'unavailable', "unavailableSince" = now() where "githubRepoId" = ${REPO_ID}::bigint`,
    );
    expect((await store.loadProject(PROJECT))?.repos[0]).toMatchObject({
      available: false,
    });
    expect(
      await store.loadProject("e1000000-0000-4000-a000-0000000000ff"),
    ).toBeNull();
  });
});

describe("beginning a proposal", () => {
  it("records it opening with the base commit, and the repository as the docs repository", async () => {
    await store.beginProposal(proposal());
    expect(await proposalRow()).toMatchObject({
      state: "opening",
      baseSha: SHA,
      prNumber: null,
    });
    expect((await projectRow()).docsRepoId).toBe(REPO_ID);
    expect(await store.activeProposal(PROJECT)).toMatchObject({
      id: PROPOSAL,
      state: "opening",
      enable: true,
      githubRepoId: REPO_ID,
      ownerId: "191",
      requestedBy: MEMBER,
    });
  });

  it("is idempotent under the same id: it only refreshes the base commit", async () => {
    await store.beginProposal(proposal());
    const newer = "e2" + "0".repeat(38);
    await store.beginProposal(proposal({ baseSha: newer }));
    expect(await inFlight()).toHaveLength(1);
    expect(await proposalRow()).toMatchObject({
      state: "opening",
      baseSha: newer,
    });
  });

  it("refuses a second proposal for the project while one is in flight, and allows one once it ends", async () => {
    await store.beginProposal(proposal());
    await expect(
      store.beginProposal(proposal({ id: SECOND })),
    ).rejects.toBeInstanceOf(ExpectedFailure);
    expect(await proposalRow(SECOND)).toBeUndefined();

    await store.markOpen(PROPOSAL, {
      number: 4101,
      url: "https://github.com/x/y/pull/4101",
    });
    await expect(
      store.beginProposal(proposal({ id: SECOND })),
    ).rejects.toBeInstanceOf(ExpectedFailure);

    await store.settleClosed((await store.activeProposal(PROJECT))!);
    await store.beginProposal(proposal({ id: SECOND }));
    expect((await store.activeProposal(PROJECT))?.id).toBe(SECOND);
  });

  it("lets two projects each have one in flight", async () => {
    await db.execute(
      sql`insert into platform.projects (id, name, slug) values (${OTHER}::uuid, 'E1 other fixture', 'e1-other-fixture')`,
    );
    await store.beginProposal(proposal());
    await store.beginProposal(
      proposal({ id: SECOND, projectId: OTHER, enable: false }),
    );
    expect(await inFlight()).toHaveLength(2);
  });

  it("does not choose a docs repository for a removal, and keeps one already chosen", async () => {
    await store.beginProposal(proposal({ enable: false }));
    expect((await projectRow()).docsRepoId).toBeNull();
    await store.settleClosed((await store.activeProposal(PROJECT))!);

    await db.execute(
      sql`update platform.projects set "docsRepoId" = ${REPO_ID}::bigint where id = ${PROJECT}::uuid`,
    );
    await store.beginProposal(proposal({ id: SECOND }));
    expect((await projectRow()).docsRepoId).toBe(REPO_ID);
  });

  it("holds the project's slug still while it is in flight", async () => {
    await store.beginProposal(proposal());
    await expect(
      db.execute(
        sql`update platform.projects set slug = 'e1-docs-renamed' where id = ${PROJECT}::uuid`,
      ),
    ).rejects.toThrow();
    await store.markFailed(PROPOSAL, "never opened");
    await db.execute(
      sql`update platform.projects set slug = 'e1-docs-renamed' where id = ${PROJECT}::uuid`,
    );
  });
});

describe("bringing the flag into line with the map", () => {
  it("turns docs on and records the docs repository only when there is none; turning off keeps it", async () => {
    await store.setRequested(PROJECT, true, REPO_ID);
    expect(await projectRow()).toMatchObject({
      docsRequested: true,
      docsRepoId: REPO_ID,
    });
    await store.setRequested(PROJECT, false, REPO_ID);
    expect(await projectRow()).toMatchObject({
      docsRequested: false,
      docsRepoId: REPO_ID,
    });
  });
});

describe("following the pull request", () => {
  it("marks it open with its number and address, and clears a noted error", async () => {
    await store.beginProposal(proposal());
    await store.noteError(PROPOSAL, "GitHub answered 502");
    expect(await proposalRow()).toMatchObject({
      state: "opening",
      lastError: "GitHub answered 502",
    });
    await store.markOpen(PROPOSAL, {
      number: 4102,
      url: "https://github.com/x/y/pull/4102",
    });
    expect(await proposalRow()).toMatchObject({
      state: "open",
      prNumber: 4102,
      prUrl: "https://github.com/x/y/pull/4102",
      lastError: null,
    });
  });

  it("fails an opening proposal, freeing the project", async () => {
    await store.beginProposal(proposal());
    await store.markFailed(PROPOSAL, "The pull request was never opened");
    expect(await proposalRow()).toMatchObject({
      state: "failed",
      lastError: "The pull request was never opened",
    });
    expect(await store.activeProposal(PROJECT)).toBeNull();
  });

  it("a merged enabling turns docs on and records who confirmed which owner", async () => {
    await store.beginProposal(proposal());
    await store.markOpen(PROPOSAL, {
      number: 4103,
      url: "https://github.com/x/y/pull/4103",
    });
    await store.settleMerged((await store.activeProposal(PROJECT))!);
    expect(await proposalRow()).toMatchObject({ state: "merged" });
    expect(await projectRow()).toMatchObject({
      docsRequested: true,
      confirmedOwner: "191",
      confirmedBy: MEMBER,
      paused: false,
    });
    const events = await db.execute<{ action: string }>(
      sql`select action from platform."auditEvents" where "targetId" = ${PROJECT}`,
    );
    expect(events.map((e) => e.action)).toEqual(["project.docs_pr_merged"]);
  });

  it("settling twice changes nothing the second time", async () => {
    await store.beginProposal(proposal());
    const row = (await store.activeProposal(PROJECT))!;
    await store.settleMerged(row);
    await db.execute(
      sql`update platform.projects set "docsRequested" = false where id = ${PROJECT}::uuid`,
    );
    await store.settleMerged(row);
    expect((await projectRow()).docsRequested).toBe(false);
    expect(
      await db.execute(
        sql`select 1 from platform."auditEvents" where "targetId" = ${PROJECT}`,
      ),
    ).toHaveLength(1);
  });

  it("a merged owner confirmation lifts the pause only while the repository still has that owner", async () => {
    // Docs on, then the repository moves to another owner: paused.
    await db.execute(
      sql`update platform.projects set "docsRequested" = true, "docsRepoId" = ${REPO_ID}::bigint where id = ${PROJECT}::uuid`,
    );
    await saveRepo({
      ...repo,
      owner: { id: 277, login: "new-owner", type: "User" },
    });
    expect((await projectRow()).paused).toBe(true);

    // The confirmation names the new owner and merges: the pause lifts.
    await store.beginProposal(proposal({ ownerId: "277" }));
    await store.settleMerged((await store.activeProposal(PROJECT))!);
    expect(await projectRow()).toMatchObject({
      paused: false,
      confirmedOwner: "277",
      docsRequested: true,
    });

    // A second transfer while a confirmation waits keeps the pause.
    await saveRepo({
      ...repo,
      owner: { id: 377, login: "third-owner", type: "User" },
    });
    expect((await projectRow()).paused).toBe(true);
    await store.beginProposal(proposal({ id: SECOND, ownerId: "277" }));
    await store.settleMerged((await store.activeProposal(PROJECT))!);
    expect(await projectRow()).toMatchObject({
      paused: true,
      confirmedOwner: "277",
    });
  });

  it("a merged removal turns docs off", async () => {
    await db.execute(
      sql`update platform.projects set "docsRequested" = true where id = ${PROJECT}::uuid`,
    );
    await store.beginProposal(proposal({ enable: false }));
    await store.settleMerged((await store.activeProposal(PROJECT))!);
    expect((await projectRow()).docsRequested).toBe(false);
  });

  it("a pull request closed unmerged changes nothing about the project", async () => {
    await store.beginProposal(proposal());
    await store.settleClosed((await store.activeProposal(PROJECT))!);
    expect(await proposalRow()).toMatchObject({ state: "closed" });
    expect(await projectRow()).toMatchObject({
      docsRequested: false,
      confirmedOwner: null,
    });
  });

  it("lists what is in flight, oldest first, and nothing that has ended", async () => {
    await store.beginProposal(proposal());
    expect((await inFlight()).map((p) => p.id)).toEqual([PROPOSAL]);
    await store.markFailed(PROPOSAL, "gone");
    expect(await inFlight()).toEqual([]);
  });
});

describe("recording a first publication", () => {
  it("is written once, only for a project whose docs are on, and then freezes the slug", async () => {
    const at = new Date("2026-11-01T10:00:00.000Z");
    expect(await store.markPublished(SLUG, at)).toBe(false);
    expect((await projectRow()).published).toBe(false);

    await db.execute(
      sql`update platform.projects set "docsRequested" = true where id = ${PROJECT}::uuid`,
    );
    expect(await store.markPublished(SLUG, at)).toBe(true);
    expect(await projectRow()).toMatchObject({ published: true });
    expect(
      await store.markPublished(SLUG, new Date("2026-12-01T00:00:00Z")),
    ).toBe(false);
    const [row] = await db.execute<{ at: string }>(
      sql`select to_char("docsFirstPublishedAt" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as at from platform.projects where id = ${PROJECT}::uuid`,
    );
    expect(row?.at).toBe("2026-11-01T10:00:00");

    await expect(
      db.execute(
        sql`update platform.projects set slug = 'e1-docs-renamed' where id = ${PROJECT}::uuid`,
      ),
    ).rejects.toThrow();
  });

  it("knows no project by a slug it doesn't have", async () => {
    expect(await store.markPublished("e1-no-such-project", new Date())).toBe(
      false,
    );
  });
});
