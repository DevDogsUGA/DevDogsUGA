// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";

/**
 * Invite search and `@handle` resolution against a real database: who the
 * picker may suggest, who may ask, and that the `@handle` branch of
 * `resolveInvitee` sees exactly the Community directory and nothing else.
 *
 * `resolveInvitee` is private to a `"use server"` file (every export there is
 * browser-callable), so it is exercised through `inviteToTeam` and the request
 * row it leaves behind.
 */

vi.mock("~/server/github/teamSync", () => ({
  provisionTeam: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
  disbandTeam: vi.fn(),
  githubLoginFor: vi.fn(() => Promise.resolve(null)),
  userIdForGithubLogin: vi.fn(() => Promise.resolve(null)),
}));
// Invitation emails are best-effort and must never leave the test.
vi.mock("~/server/email/send", () => ({
  sendTemplate: vi.fn(() => Promise.resolve()),
  sendEach: vi.fn(() => Promise.resolve()),
}));

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));

const { inviteToTeam, searchInvitees } = await import("~/server/actions/teams");

const id = (n: number) =>
  `e3180000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const LEAD = id(1);
const NOT_LEAD = id(2);
const ADA = id(3);
const HIDDEN = id(4);
const UNVERIFIED = id(5);
const NAMELESS = id(6);
const ALL = [LEAD, NOT_LEAD, ADA, HIDDEN, UNVERIFIED, NAMELESS] as const;
const TEAM = "e3180000-0000-4000-b000-000000000001";

async function cleanup() {
  await db.execute(sql`delete from platform.teams where id = ${TEAM}::uuid`);
  await db.execute(
    sql`delete from platform."rateLimitHits" where "subjectId" = ${TEAM}::uuid`,
  );
  await deleteMembers(ALL);
}

beforeEach(async () => {
  await cleanup();
  await insertMember({ id: LEAD, handle: "t318-lead" });
  await insertMember({ id: NOT_LEAD, handle: "t318-notlead" });
  await insertMember({
    id: ADA,
    handle: "t318-ada",
    first: "Ada",
    last: "Lovelace",
  });
  await insertMember({
    id: HIDDEN,
    handle: "t318-hidden",
    first: "Ada",
    last: "Hidden",
    profile: { publicProfile: false },
  });
  await insertMember({
    id: UNVERIFIED,
    handle: "t318-unver",
    first: "Ada",
    last: "Unverified",
    verified: false,
  });
  await insertMember({
    id: NAMELESS,
    handle: "t318-nameless",
    first: "Zed",
    last: "Nameless",
    profile: { showName: false },
  });
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${TEAM}::uuid, 't318-team', 'T318', 'T31822', ${LEAD}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "userId", role)
    values (${TEAM}::uuid, ${LEAD}::uuid, 'lead'),
           (${TEAM}::uuid, ${NOT_LEAD}::uuid, 'member')
  `);
  session.userId = LEAD;
});
afterAll(cleanup);

async function invitedUserIds(): Promise<string[]> {
  const rows = await db.execute<{ userId: string }>(sql`
    select "userId" from platform."teamMembershipRequests"
    where "teamId" = ${TEAM}::uuid and direction = 'invite'
  `);
  return Array.from(rows, (row) => row.userId);
}

describe("searchInvitees", () => {
  it("suggests public members only, with no account id", async () => {
    const outcome = await searchInvitees(TEAM, "ada");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.map((s) => s.handle)).toEqual(["t318-ada"]);
    expect(outcome.value[0]).toMatchObject({
      handle: "t318-ada",
      label: "Ada Lovelace",
    });
    const wire = JSON.stringify(outcome.value);
    for (const userId of ALL) expect(wire).not.toContain(userId);
    for (const suggestion of outcome.value) {
      expect(Object.keys(suggestion).sort()).toEqual([
        "avatarUrl",
        "handle",
        "label",
      ]);
    }
  });

  it("labels a hidden name with the handle and never matches it", async () => {
    const byHandle = await searchInvitees(TEAM, "t318-nameless");
    expect(byHandle).toEqual({
      ok: true,
      value: [expect.objectContaining({ label: "@t318-nameless" })],
    });
    const byName = await searchInvitees(TEAM, "zed");
    expect(byName).toEqual({ ok: true, value: [] });
  });

  it("returns nothing for a query under two characters", async () => {
    expect(await searchInvitees(TEAM, "a")).toEqual({ ok: true, value: [] });
    expect(await searchInvitees(TEAM, " @a ")).toEqual({
      ok: true,
      value: [],
    });
  });

  it("is for leads only", async () => {
    session.userId = NOT_LEAD;
    expect(await searchInvitees(TEAM, "ada")).toEqual({
      ok: false,
      code: "not_the_lead",
    });
    session.userId = ADA;
    expect(await searchInvitees(TEAM, "ada")).toEqual({
      ok: false,
      code: "not_a_member",
    });
  });

  it("is rate limited per caller", async () => {
    for (let i = 0; i < 60; i += 1) {
      const outcome = await searchInvitees(TEAM, "ada");
      expect(outcome.ok).toBe(true);
    }
    expect(await searchInvitees(TEAM, "ada")).toEqual({
      ok: false,
      code: "rate_limited",
    });
  });
});

describe("inviteToTeam identifiers", () => {
  it("resolves an @handle to a public member", async () => {
    const outcome = await inviteToTeam(TEAM, "@t318-ada");
    expect(outcome.ok).toBe(true);
    expect(await invitedUserIds()).toEqual([ADA]);
  });

  it("matches the handle case-insensitively and ignores surrounding space", async () => {
    const outcome = await inviteToTeam(TEAM, "  @T318-Ada ");
    expect(outcome.ok).toBe(true);
    expect(await invitedUserIds()).toEqual([ADA]);
  });

  it("treats a hidden, unverified or unknown handle exactly like a miss", async () => {
    for (const handle of ["@t318-hidden", "@t318-unver", "@t318-nobody"]) {
      expect(await inviteToTeam(TEAM, handle)).toEqual({
        ok: false,
        code: "invitee_not_found",
      });
    }
    expect(await invitedUserIds()).toEqual([]);
  });

  it("does not treat a prefix of a handle as that handle", async () => {
    expect(await inviteToTeam(TEAM, "@t318-ad")).toEqual({
      ok: false,
      code: "invitee_not_found",
    });
  });

  it("still resolves an email, including for a member who is not public", async () => {
    const outcome = await inviteToTeam(
      TEAM,
      `pp-dbtest-${HIDDEN}@persona.test`,
    );
    expect(outcome.ok).toBe(true);
    expect(await invitedUserIds()).toEqual([HIDDEN]);
  });

  it("does not read a string with a second @ as a handle", async () => {
    expect(await inviteToTeam(TEAM, "@t318-ada@persona.test")).toEqual({
      ok: false,
      code: "invitee_not_found",
    });
    expect(await invitedUserIds()).toEqual([]);
  });
});
