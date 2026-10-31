// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import {
  deleteSubmissionRecord,
  mayEdit,
  saveNewSubmission,
  saveSubmissionEdit,
} from "./store";

/**
 * Submissions against a real database (D4; Q48): the owner rule and the
 * DevDogs-owned officer rule, who may be on a team, the unique link, and what
 * deleting a Submission, a Project member or an account leaves behind.
 * Fixture ids are all `d4...`; projects are named `D4S ...`; links are under
 * `https://d4sub-*.example.com`.
 */

const id = (n: number) =>
  `d4000000-0000-4000-a000-0000000002${String(n).padStart(2, "0")}`;
const OWNER = id(1);
const OTHER_OWNER = id(2);
const STRANGER = id(3);
const OFFICER = id(4);
const TEAMMATE = id(5);
const MEMBERS = [OWNER, OTHER_OWNER, STRANGER, OFFICER, TEAMMATE] as const;
const NO_PROFILE = id(6);
const ALL = [...MEMBERS, NO_PROFILE] as const;
const ROLE = id(21);
const link = (n: number | string) => `https://d4sub-${n}.example.com/`;

let ownProject: string;
let devdogsProject: string;
let approved: string;
let pendingHackathon: string;

async function cleanup() {
  const ids = sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
  await db.execute(
    sql`delete from platform.submissions where url like 'https://d4sub-%'`,
  );
  await db.execute(
    sql`delete from platform.hackathons where url like 'https://d4sub-%'`,
  );
  // A DevDogs-owned project cannot be deleted (guard_project_structure), so the
  // fixture's is swept with triggers off, as the other project db-tests do.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(
      sql`delete from platform."projectOwners" where "projectId" in (select id from platform.projects where name like 'D4S %')`,
    );
    await tx.execute(
      sql`delete from platform.projects where name like 'D4S %'`,
    );
  });
  await db.execute(
    sql`delete from platform."userRoles" where "roleId"=${ROLE}::uuid`,
  );
  await db.execute(sql`delete from platform.roles where id=${ROLE}::uuid`);
  await db.execute(
    sql`delete from platform."rateLimitHits" where "subjectId" in (${ids})`,
  );
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);
beforeEach(async () => {
  await cleanup();
  for (const [n, member] of MEMBERS.entries())
    await insertMember({ id: member, handle: `d4sub-${n}` });
  // A sign-in with no member profile: not eligible for a team.
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${NO_PROFILE}::uuid, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', ${`d4sub-${NO_PROFILE}@persona.test`})`);
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership")
    values (${ROLE}::uuid, 'D4 Submissions Officer', 9999.62, true)`);
  await db.execute(
    sql`insert into platform."userRoles" ("userId", "roleId") values (${OFFICER}::uuid, ${ROLE}::uuid)`,
  );
  const project = async (
    name: string,
    devdogsOwned: boolean,
    owners: string[],
  ) => {
    // Archived: an active project needs an approved repository link, which
    // submissions never look at.
    const [row] = await db.execute<{ id: string }>(sql`
      insert into platform.projects (name, slug, status, "devdogsOwned")
      values (${name}, ${name.toLowerCase().replace(/\s+/gu, "-")}, 'archived', ${devdogsOwned}) returning id`);
    for (const owner of owners)
      await db.execute(
        sql`insert into platform."projectOwners" ("projectId", "userId") values (${row!.id}::uuid, ${owner}::uuid)`,
      );
    return row!.id;
  };
  ownProject = await project("D4S Member Project", false, [OWNER]);
  devdogsProject = await project("D4S DevDogs Project", true, [OTHER_OWNER]);
  const hackathon = async (n: number, approval: string) => {
    const [row] = await db.execute<{ id: string }>(sql`
      insert into platform.hackathons (source, url, name, location, approval)
      values ('other', ${link(`h${n}`)}, ${`D4S Hack ${n}`}, '', ${approval}) returning id`);
    return row!.id;
  };
  approved = await hackathon(1, "approved");
  pendingHackathon = await hackathon(2, "pending");
});

const refusal = async (work: Promise<unknown>) => {
  const error = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ExpectedFailure);
  return error as ExpectedFailure;
};
const record = (n: number | string, over: Record<string, unknown> = {}) => ({
  url: link(n),
  teamUserIds: [OWNER],
  result: null as string | null,
  ...over,
});
const members = async (submissionId: string) =>
  (
    await db.execute<{ userId: string }>(
      sql`select "userId" from platform."submissionMembers" where "submissionId"=${submissionId}::uuid order by "userId"`,
    )
  ).map((r) => r.userId);
const submissionCount = async (url: string) => {
  const [row] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from platform.submissions where url=${url}`,
  );
  return row!.n;
};

describe("mayEdit", () => {
  it("is true for an explicit owner, false for a stranger or a missing project", async () => {
    expect(await mayEdit(OWNER, ownProject)).toBe(true);
    expect(await mayEdit(STRANGER, ownProject)).toBe(false);
    expect(await mayEdit(OWNER, "00000000-0000-4000-8000-000000000000")).toBe(
      false,
    );
  });

  it("lets an officer edit a DevDogs-owned project they do not own, not a member's", async () => {
    expect(await mayEdit(OFFICER, devdogsProject)).toBe(true);
    expect(await mayEdit(OFFICER, ownProject)).toBe(false);
  });

  it("does not let an owner of another project, or a plain member, edit a DevDogs-owned one", async () => {
    expect(await mayEdit(OWNER, devdogsProject)).toBe(false);
    expect(await mayEdit(STRANGER, devdogsProject)).toBe(false);
    expect(await mayEdit(OTHER_OWNER, devdogsProject)).toBe(true);
  });
});

describe("saveNewSubmission", () => {
  it("records the Submission and its team, with the canonical link", async () => {
    const { id: submissionId } = await saveNewSubmission(
      OWNER,
      ownProject,
      approved,
      {
        url: "HTTP://D4sub-1.Example.com?utm_source=x#frag",
        teamUserIds: [OWNER, TEAMMATE, OWNER],
        result: " Winner ",
      },
    );
    const [row] = await db.execute<{
      url: string;
      result: string;
      recordedBy: string;
      projectId: string;
      hackathonId: string;
    }>(
      sql`select url, result, "recordedBy", "projectId", "hackathonId" from platform.submissions where id=${submissionId}::uuid`,
    );
    expect(row).toEqual({
      url: link(1),
      result: "Winner",
      recordedBy: OWNER,
      projectId: ownProject,
      hackathonId: approved,
    });
    expect(await members(submissionId)).toEqual([OWNER, TEAMMATE].sort());
  });

  it("lets an officer record for a DevDogs-owned project", async () => {
    const { id: submissionId } = await saveNewSubmission(
      OFFICER,
      devdogsProject,
      approved,
      record(2, { teamUserIds: [OFFICER] }),
    );
    expect(await members(submissionId)).toEqual([OFFICER]);
  });

  it("refuses a stranger, an owner of another project, and an officer on a member's project", async () => {
    for (const actor of [STRANGER, OTHER_OWNER, OFFICER])
      await refusal(saveNewSubmission(actor, ownProject, approved, record(3)));
    expect(await submissionCount(link(3))).toBe(0);
  });

  it("refuses a team member who is a sign-in without a member profile, or no account at all", async () => {
    const error = await refusal(
      saveNewSubmission(
        OWNER,
        ownProject,
        approved,
        record(4, { teamUserIds: [OWNER, NO_PROFILE] }),
      ),
    );
    expect(error.fieldErrors?.team).toBeDefined();
    await refusal(
      saveNewSubmission(
        OWNER,
        ownProject,
        approved,
        record(4, { teamUserIds: ["00000000-0000-4000-8000-000000000000"] }),
      ),
    );
    expect(await submissionCount(link(4))).toBe(0);
  });

  it("refuses an empty team, a long result and a bad link, together", async () => {
    const error = await refusal(
      saveNewSubmission(OWNER, ownProject, approved, {
        url: "nope",
        teamUserIds: [],
        result: "r".repeat(281),
      }),
    );
    expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual([
      "result",
      "team",
      "url",
    ]);
  });

  it("refuses a hackathon that is pending, declined or missing", async () => {
    await db.execute(
      sql`update platform.hackathons set approval='declined' where id=${pendingHackathon}::uuid`,
    );
    for (const target of [
      pendingHackathon,
      "00000000-0000-4000-8000-000000000000",
    ])
      expect(
        (await refusal(saveNewSubmission(OWNER, ownProject, target, record(5))))
          .message,
      ).toBe("That hackathon isn't approved yet.");
    expect(await submissionCount(link(5))).toBe(0);
  });

  it("holds one Submission per link, whichever project or spelling", async () => {
    await saveNewSubmission(OWNER, ownProject, approved, record(6));
    const taken = await refusal(
      saveNewSubmission(
        OTHER_OWNER,
        devdogsProject,
        approved,
        record(6, { url: "d4sub-6.example.com", teamUserIds: [OTHER_OWNER] }),
      ),
    );
    expect(taken.fieldErrors?.url).toBeDefined();
    expect(await submissionCount(link(6))).toBe(1);
  });

  it("creates only one when the same link is recorded at once, leaving no orphaned team", async () => {
    const results = await Promise.allSettled([
      saveNewSubmission(OWNER, ownProject, approved, record(7)),
      saveNewSubmission(
        OTHER_OWNER,
        devdogsProject,
        approved,
        record(7, { teamUserIds: [OTHER_OWNER] }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await submissionCount(link(7))).toBe(1);
    const [row] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform."submissionMembers" m
      join platform.submissions s on s.id = m."submissionId" where s.url=${link(7)}`);
    expect(row!.n).toBe(1);
  });
});

describe("saveSubmissionEdit and deleteSubmissionRecord", () => {
  const make = async (n: number) =>
    (
      await saveNewSubmission(
        OWNER,
        ownProject,
        approved,
        record(n, { teamUserIds: [OWNER, TEAMMATE] }),
      )
    ).id;

  it("replaces the link, result and team, and leaves the Project and Hackathon fixed", async () => {
    const submissionId = await make(10);
    expect(
      await saveSubmissionEdit(OWNER, submissionId, {
        url: link("10b"),
        teamUserIds: [OWNER, STRANGER],
        result: "3rd",
      }),
    ).toEqual({
      projectId: ownProject,
    });
    expect(await members(submissionId)).toEqual([OWNER, STRANGER].sort());
    const [row] = await db.execute<{
      url: string;
      result: string;
      projectId: string;
      hackathonId: string;
    }>(
      sql`select url, result, "projectId", "hackathonId" from platform.submissions where id=${submissionId}::uuid`,
    );
    expect(row).toEqual({
      url: link("10b"),
      result: "3rd",
      projectId: ownProject,
      hackathonId: approved,
    });
  });

  it("lets an edit keep its own link, and clears the result", async () => {
    const submissionId = await make(11);
    await saveSubmissionEdit(OWNER, submissionId, {
      url: link(11),
      teamUserIds: [OWNER],
      result: "",
    });
    const [row] = await db.execute<{ result: string | null }>(
      sql`select result from platform.submissions where id=${submissionId}::uuid`,
    );
    expect(row!.result).toBeNull();
  });

  it("refuses a link another Submission holds, and a team member without a profile, changing nothing", async () => {
    const first = await make(12);
    const second = await make(13);
    expect(
      (await refusal(saveSubmissionEdit(OWNER, second, record(12)))).fieldErrors
        ?.url,
    ).toBeDefined();
    await refusal(
      saveSubmissionEdit(
        OWNER,
        first,
        record(14, { teamUserIds: [NO_PROFILE] }),
      ),
    );
    expect(await members(first)).toEqual([OWNER, TEAMMATE].sort());
    expect(await submissionCount(link(14))).toBe(0);
  });

  it("fails the same way for a stranger and for a Submission that does not exist", async () => {
    const submissionId = await make(15);
    const stranger = await refusal(
      saveSubmissionEdit(STRANGER, submissionId, record(15)),
    );
    const missing = await refusal(
      saveSubmissionEdit(
        OWNER,
        "00000000-0000-4000-8000-000000000000",
        record(15),
      ),
    );
    expect(stranger.message).toBe(missing.message);
    await refusal(deleteSubmissionRecord(STRANGER, submissionId));
    expect(await submissionCount(link(15))).toBe(1);
  });

  it("deletes the Submission and its team, and keeps the Project and Hackathon", async () => {
    const submissionId = await make(16);
    expect(await deleteSubmissionRecord(OWNER, submissionId)).toEqual({
      projectId: ownProject,
    });
    expect(await submissionCount(link(16))).toBe(0);
    expect(await members(submissionId)).toEqual([]);
    const [kept] = await db.execute<{ n: number }>(sql`
      select (select count(*) from platform.projects where id=${ownProject}::uuid)::int
           + (select count(*) from platform.hackathons where id=${approved}::uuid)::int as n`);
    expect(kept!.n).toBe(2);
  });

  it("lets an officer edit and delete a DevDogs-owned project's Submission", async () => {
    const { id: submissionId } = await saveNewSubmission(
      OTHER_OWNER,
      devdogsProject,
      approved,
      record(17, { teamUserIds: [OTHER_OWNER] }),
    );
    await saveSubmissionEdit(
      OFFICER,
      submissionId,
      record(17, { teamUserIds: [OTHER_OWNER, OFFICER], result: "ok" }),
    );
    expect(await members(submissionId)).toEqual([OTHER_OWNER, OFFICER].sort());
    await deleteSubmissionRecord(OFFICER, submissionId);
    expect(await submissionCount(link(17))).toBe(0);
  });
});

describe("what other deletions leave", () => {
  it("keeps a Submission, with no recorder, when its recorder's account is erased", async () => {
    const { id: submissionId } = await saveNewSubmission(
      OWNER,
      ownProject,
      approved,
      record(20, { teamUserIds: [OWNER, TEAMMATE] }),
    );
    await db.execute(sql`delete from auth.users where id=${OWNER}::uuid`);
    const [row] = await db.execute<{ recordedBy: string | null }>(
      sql`select "recordedBy" from platform.submissions where id=${submissionId}::uuid`,
    );
    expect(row!.recordedBy).toBeNull();
    expect(await members(submissionId)).toEqual([TEAMMATE]);
  });

  it("lets a team empty out when every member's account is erased, and keeps the Submission", async () => {
    const { id: submissionId } = await saveNewSubmission(
      OWNER,
      ownProject,
      approved,
      record(21, { teamUserIds: [TEAMMATE] }),
    );
    await db.execute(sql`delete from auth.users where id=${TEAMMATE}::uuid`);
    expect(await members(submissionId)).toEqual([]);
    expect(await submissionCount(link(21))).toBe(1);
  });

  it("does not let a Hackathon with Submissions be deleted", async () => {
    await saveNewSubmission(OWNER, ownProject, approved, record(22));
    await expect(
      db.execute(
        sql`delete from platform.hackathons where id=${approved}::uuid`,
      ),
    ).rejects.toThrow();
  });
});
