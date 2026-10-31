// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

/** A drizzle query builder that resolves, when awaited, to the next queued result for its kind. */
const mocks = vi.hoisted(() => {
  const calls: { op: string; args: unknown[] }[] = [];
  const results: Record<string, unknown[]> = {};
  const builder = (kind: string): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            const next = results[kind]?.shift();
            return (
              resolve: (v: unknown) => unknown,
              reject: (e: unknown) => unknown,
            ) => (next instanceof Error ? reject(next) : resolve(next ?? []));
          }
          return (...args: unknown[]) => {
            calls.push({ op: `${kind}.${prop}`, args });
            return builder(kind);
          };
        },
      },
    );
  const tx = {
    insert: () => builder("tx.insert"),
    update: () => builder("tx.update"),
    delete: () => builder("tx.delete"),
  };
  return {
    calls,
    results,
    queue: (kind: string, ...rows: unknown[]) =>
      void (results[kind] = [...(results[kind] ?? []), ...rows]),
    callerFor: vi.fn(),
    db: {
      select: () => builder("select"),
      delete: () => builder("delete"),
      execute: () => builder("execute"),
      transaction: async (work: (t: typeof tx) => unknown) => work(tx),
    },
  };
});

vi.mock("~/server/db", () => ({ db: mocks.db }));
vi.mock("~/server/auth/access", () => ({
  callerFor: mocks.callerFor,
  rules: { officer: (caller: { isLeader: boolean }) => caller.isLeader },
}));

const store = await import("./store");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const HACKATHON = "33333333-3333-4333-8333-333333333333";
const SUBMISSION = "44444444-4444-4444-8444-444444444444";
const TEAMMATE = "55555555-5555-4555-8555-555555555555";
const input = {
  url: "http://Devpost.com/software/dogdays/?utm_source=x",
  teamUserIds: [ACTOR, TEAMMATE],
  result: " 2nd place ",
};
const call = (op: string) => mocks.calls.filter((c) => c.op === op);
const failureOf = async (work: Promise<unknown>) => {
  const error = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ExpectedFailure);
  return error as ExpectedFailure;
};
const uniqueViolation = () =>
  Object.assign(new Error("dup"), { cause: { code: "23505" } });

beforeEach(() => {
  mocks.calls.length = 0;
  for (const key of Object.keys(mocks.results)) delete mocks.results[key];
  mocks.callerFor
    .mockReset()
    .mockResolvedValue({ userId: ACTOR, isLeader: false });
});

describe("mayEdit: the record rule", () => {
  const project = (owner: boolean, devdogsOwned: boolean) =>
    mocks.queue("execute", [{ owner, devdogsOwned }]);

  it("lets an explicit owner edit, DevDogs-owned or not, without asking who they are", async () => {
    project(true, false);
    expect(await store.mayEdit(ACTOR, PROJECT)).toBe(true);
    project(true, true);
    expect(await store.mayEdit(ACTOR, PROJECT)).toBe(true);
    expect(mocks.callerFor).not.toHaveBeenCalled();
  });

  it("lets an officer edit a DevDogs-owned project they do not own", async () => {
    project(false, true);
    mocks.callerFor.mockResolvedValue({ userId: ACTOR, isLeader: true });
    expect(await store.mayEdit(ACTOR, PROJECT)).toBe(true);
    expect(mocks.callerFor).toHaveBeenCalledWith(ACTOR);
  });

  it("does not let an officer edit a member-owned project they do not own", async () => {
    project(false, false);
    mocks.callerFor.mockResolvedValue({ userId: ACTOR, isLeader: true });
    expect(await store.mayEdit(ACTOR, PROJECT)).toBe(false);
  });

  it("does not let a member who is not an owner edit, even a DevDogs-owned project", async () => {
    project(false, true);
    expect(await store.mayEdit(ACTOR, PROJECT)).toBe(false);
  });

  it("lets no one edit a project that does not exist", async () => {
    mocks.queue("execute");
    mocks.callerFor.mockResolvedValue({ userId: ACTOR, isLeader: true });
    expect(await store.mayEdit(ACTOR, PROJECT)).toBe(false);
  });
});

describe("saveNewSubmission", () => {
  const owner = () =>
    mocks.queue("execute", [{ owner: true, devdogsOwned: false }]);
  const members = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `m${i}` }));

  it("refuses a non-owner before reading anything else", async () => {
    mocks.queue("execute", [{ owner: false, devdogsOwned: false }]);
    await failureOf(store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, input));
    expect(call("select.from")).toEqual([]);
  });

  it("validates the link, team size and result length together", async () => {
    owner();
    const error = await failureOf(
      store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, {
        url: "nope",
        teamUserIds: [],
        result: "r".repeat(281),
      }),
    );
    expect(error.fieldErrors).toEqual({
      url: expect.any(String) as string,
      team: "Add at least one team member.",
      result: "Use at most 280 characters.",
    });
  });

  it("refuses a team over the limit, counting a repeated member once", async () => {
    owner();
    const ids = Array.from(
      { length: 21 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(
      (
        await failureOf(
          store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, {
            ...input,
            teamUserIds: ids,
          }),
        )
      ).fieldErrors,
    ).toEqual({ team: "A team has at most 20 members." });
    owner();
    mocks.queue("select", [{ id: ACTOR }], [{ approval: "approved" }]);
    mocks.queue("tx.insert", [{ id: SUBMISSION }], []);
    await store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, {
      ...input,
      teamUserIds: [ACTOR, ACTOR],
    });
    expect(call("tx.insert.values")[1]!.args[0]).toEqual([
      { submissionId: SUBMISSION, userId: ACTOR },
    ]);
  });

  it("refuses a team member who has no member profile", async () => {
    owner();
    mocks.queue("select", members(1));
    const error = await failureOf(
      store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, input),
    );
    expect(error.fieldErrors).toEqual({
      team: "Every team member must be a DevDogs member.",
    });
    expect(call("tx.insert.values")).toEqual([]);
  });

  it("refuses a hackathon that is not approved, or does not exist", async () => {
    for (const rows of [
      [{ approval: "pending" }],
      [{ approval: "declined" }],
      [],
    ]) {
      owner();
      mocks.queue("select", members(2), rows);
      expect(
        (
          await failureOf(
            store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, input),
          )
        ).message,
      ).toBe("That hackathon isn't approved yet.");
    }
    expect(call("tx.insert.values")).toEqual([]);
  });

  it("records the Submission and its team in one transaction, with the canonical link", async () => {
    owner();
    mocks.queue("select", members(2), [{ approval: "approved" }]);
    mocks.queue("tx.insert", [{ id: SUBMISSION }], []);
    await expect(
      store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, input),
    ).resolves.toEqual({ id: SUBMISSION });
    const [submission] = call("tx.insert.values")[0]!.args;
    expect(submission).toEqual({
      projectId: PROJECT,
      hackathonId: HACKATHON,
      url: "https://devpost.com/software/dogdays",
      result: "2nd place",
      recordedBy: ACTOR,
    });
    expect(call("tx.insert.values")[1]!.args[0]).toEqual([
      { submissionId: SUBMISSION, userId: ACTOR },
      { submissionId: SUBMISSION, userId: TEAMMATE },
    ]);
  });

  it("stores a blank result as none", async () => {
    owner();
    mocks.queue("select", members(2), [{ approval: "approved" }]);
    mocks.queue("tx.insert", [{ id: SUBMISSION }], []);
    await store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, {
      ...input,
      result: "  ",
    });
    expect(call("tx.insert.values")[0]!.args[0]).toMatchObject({
      result: null,
    });
  });

  it("says the link is taken on a unique violation, and rethrows anything else", async () => {
    owner();
    mocks.queue("select", members(2), [{ approval: "approved" }]);
    mocks.queue("tx.insert", uniqueViolation());
    const error = await failureOf(
      store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, input),
    );
    expect(error.fieldErrors).toEqual({
      url: "That submission link is already recorded.",
    });
    owner();
    mocks.queue("select", members(2), [{ approval: "approved" }]);
    mocks.queue("tx.insert", new Error("connection lost"));
    await expect(
      store.saveNewSubmission(ACTOR, PROJECT, HACKATHON, input),
    ).rejects.toThrow("connection lost");
  });
});

describe("saveSubmissionEdit and deleteSubmissionRecord", () => {
  const row = () => mocks.queue("select", [{ projectId: PROJECT }]);
  const owner = () =>
    mocks.queue("execute", [{ owner: true, devdogsOwned: false }]);

  it("fails the same way for a missing Submission and one the actor may not edit", async () => {
    mocks.queue("select", []);
    const missing = await failureOf(
      store.saveSubmissionEdit(ACTOR, SUBMISSION, input),
    );
    row();
    mocks.queue("execute", [{ owner: false, devdogsOwned: false }]);
    const forbidden = await failureOf(
      store.saveSubmissionEdit(ACTOR, SUBMISSION, input),
    );
    expect(missing.message).toBe("That submission was not found.");
    expect(forbidden.message).toBe(missing.message);
    row();
    mocks.queue("execute", [{ owner: false, devdogsOwned: false }]);
    await failureOf(store.deleteSubmissionRecord(ACTOR, SUBMISSION));
    expect(call("delete.where")).toEqual([]);
  });

  it("replaces the link, result and team, and answers with the Project", async () => {
    row();
    owner();
    mocks.queue("select", [{ id: ACTOR }, { id: TEAMMATE }]);
    await expect(
      store.saveSubmissionEdit(ACTOR, SUBMISSION, input),
    ).resolves.toEqual({ projectId: PROJECT });
    expect(call("tx.update.set")[0]!.args[0]).toEqual({
      url: "https://devpost.com/software/dogdays",
      result: "2nd place",
    });
    expect(call("tx.delete.where")).toHaveLength(1);
    expect(call("tx.insert.onConflictDoNothing")).toHaveLength(1);
  });

  it("validates before writing and maps a unique violation to the link-taken message", async () => {
    row();
    owner();
    await failureOf(
      store.saveSubmissionEdit(ACTOR, SUBMISSION, {
        ...input,
        teamUserIds: [],
      }),
    );
    expect(call("tx.update.set")).toEqual([]);
    row();
    owner();
    mocks.queue("select", [{ id: ACTOR }, { id: TEAMMATE }]);
    mocks.queue("tx.update", uniqueViolation());
    expect(
      (await failureOf(store.saveSubmissionEdit(ACTOR, SUBMISSION, input)))
        .fieldErrors,
    ).toEqual({
      url: "That submission link is already recorded.",
    });
  });

  it("deletes for an owner and answers with the Project", async () => {
    row();
    owner();
    await expect(
      store.deleteSubmissionRecord(ACTOR, SUBMISSION),
    ).resolves.toEqual({ projectId: PROJECT });
    expect(call("delete.where")).toHaveLength(1);
  });

  it("lets an officer edit and delete on a DevDogs-owned project", async () => {
    mocks.callerFor.mockResolvedValue({ userId: ACTOR, isLeader: true });
    row();
    mocks.queue("execute", [{ owner: false, devdogsOwned: true }]);
    await expect(
      store.deleteSubmissionRecord(ACTOR, SUBMISSION),
    ).resolves.toEqual({ projectId: PROJECT });
  });
});
