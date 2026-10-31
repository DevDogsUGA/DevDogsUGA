// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";
import type { Caller } from "~/server/auth/access";

/**
 * A drizzle query builder that records its calls and resolves, when awaited,
 * to the next queued result. Every method returns the builder.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; args: unknown[] }[] = [];
  const results: Record<string, unknown[][]> = {};
  const builder = (kind: string): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            const next = results[kind]?.shift() ?? [];
            return (resolve: (v: unknown) => unknown) => resolve(next);
          }
          return (...args: unknown[]) => {
            calls.push({ op: `${kind}.${prop}`, args });
            return builder(kind);
          };
        },
      },
    );
  const tx = {
    update: () => builder("tx.update"),
    insert: () => builder("tx.insert"),
  };
  const queue = (kind: string, ...rows: unknown[][]) =>
    (results[kind] = [...rows]);
  return {
    calls,
    results,
    queue,
    consumeRateLimit: vi.fn(),
    db: {
      select: () => builder("select"),
      insert: () => builder("insert"),
      transaction: async (work: (t: typeof tx) => unknown) => work(tx),
    },
  };
});

vi.mock("~/server/db", () => ({ db: mocks.db }));
vi.mock("~/server/rateLimit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));
vi.mock("~/server/auth/access", () => ({
  rules: { officer: (caller: { isLeader: boolean }) => caller.isLeader },
}));

const { decideHackathon, submitHackathon } = await import("./submit");

const MEMBER = { userId: "member-1", isLeader: false } as unknown as Caller;
const OFFICER = { userId: "officer-1", isLeader: true } as unknown as Caller;
const valid = {
  url: "https://Hack.Example.com/event/?utm_source=x",
  name: "  Great   Hack ",
};
const failureOf = async (work: Promise<unknown>) => {
  const error = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ExpectedFailure);
  return error as ExpectedFailure;
};
const call = (op: string) => mocks.calls.filter((c) => c.op === op);

beforeEach(() => {
  mocks.calls.length = 0;
  for (const key of Object.keys(mocks.results)) delete mocks.results[key];
  mocks.consumeRateLimit.mockReset().mockResolvedValue(true);
});

describe("submitHackathon: validation", () => {
  it("reports every bad field and touches nothing, not even the rate limit", async () => {
    const error = await failureOf(
      submitHackathon(MEMBER, {
        url: "not a link",
        name: "x",
        startsOn: "2026-02-30",
        endsOn: "soon",
      }),
    );
    expect(error.fieldErrors).toEqual({
      name: expect.any(String) as string,
      url: expect.any(String) as string,
      startsOn: "Use a real date.",
      endsOn: "Use a real date.",
    });
    expect(mocks.calls).toEqual([]);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("refuses an end before the start", async () => {
    const error = await failureOf(
      submitHackathon(MEMBER, {
        ...valid,
        startsOn: "2026-11-05",
        endsOn: "2026-11-04",
      }),
    );
    expect(error.fieldErrors).toEqual({
      endsOn: "The end can't be before the start.",
    });
  });

  it("refuses a name past the limit", async () => {
    const error = await failureOf(
      submitHackathon(MEMBER, { ...valid, name: "n".repeat(201) }),
    );
    expect(error.fieldErrors).toHaveProperty("name");
  });

  it("treats blank dates as none and accepts a one-day event", async () => {
    mocks.queue("select", []);
    mocks.queue("insert", [{ id: "h1" }]);
    await expect(
      submitHackathon(MEMBER, { ...valid, startsOn: " ", endsOn: "" }),
    ).resolves.toEqual({ status: "created", id: "h1" });
    mocks.queue("select", []);
    mocks.queue("insert", [{ id: "h2" }]);
    await expect(
      submitHackathon(MEMBER, {
        ...valid,
        startsOn: "2026-11-04",
        endsOn: "2026-11-04",
      }),
    ).resolves.toEqual({ status: "created", id: "h2" });
  });
});

describe("submitHackathon: a new link", () => {
  it("stores a pending member-sourced row with the canonical link and no location", async () => {
    mocks.queue("select", []);
    mocks.queue("insert", [{ id: "new-1" }]);
    const outcome = await submitHackathon(MEMBER, {
      ...valid,
      startsOn: "2026-11-02",
    });
    expect(outcome).toEqual({ status: "created", id: "new-1" });
    const [values] = call("insert.values")[0]!.args;
    expect(values).toEqual({
      source: "other",
      approval: "pending",
      url: "https://hack.example.com/event",
      name: "Great Hack",
      location: "",
      startsOn: "2026-11-02",
      endsOn: null,
      submittedBy: "member-1",
    });
  });

  it("spends the member's rate limit before writing, 10 a day", async () => {
    mocks.queue("select", []);
    mocks.queue("insert", [{ id: "new-1" }]);
    await submitHackathon(MEMBER, valid);
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith({
      scope: "hackathons:submit",
      subjectId: "member-1",
      limit: 10,
      windowSeconds: 86_400,
    });
  });

  it("refuses over the limit without inserting", async () => {
    mocks.queue("select", []);
    mocks.consumeRateLimit.mockResolvedValue(false);
    const error = await failureOf(submitHackathon(MEMBER, valid));
    expect(error.message).toMatch(/Try again tomorrow/u);
    expect(call("insert.values")).toEqual([]);
  });

  it("spends nothing on a link that is already on file", async () => {
    mocks.queue("select", [
      { id: "h", approval: "approved", submittedBy: null },
    ]);
    await submitHackathon(MEMBER, valid);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    expect(call("insert.values")).toEqual([]);
  });

  it("answers `exists` when it loses a race on the unique link", async () => {
    mocks.queue(
      "select",
      [],
      [{ id: "winner", approval: "pending", submittedBy: "someone-else" }],
    );
    mocks.queue("insert", []);
    await expect(submitHackathon(MEMBER, valid)).resolves.toEqual({
      status: "exists",
      id: "winner",
      approval: "pending",
      linkable: false,
    });
  });

  it("asks to try again when the row it lost to has vanished", async () => {
    mocks.queue("select", [], []);
    mocks.queue("insert", []);
    expect((await failureOf(submitHackathon(MEMBER, valid))).message).toBe(
      "Try that again.",
    );
  });
});

describe("submitHackathon: a link already on file", () => {
  const onFile = (approval: string, submittedBy: string | null) =>
    mocks.queue("select", [{ id: "h", approval, submittedBy }]);

  it("is ok, not an error, for an approved hackathon, and links it to anyone", async () => {
    onFile("approved", null);
    await expect(submitHackathon(MEMBER, valid)).resolves.toEqual({
      status: "exists",
      id: "h",
      approval: "approved",
      linkable: true,
    });
  });

  it("links a pending one to its submitter and to officers, not to other members", async () => {
    onFile("pending", "member-1");
    expect(await submitHackathon(MEMBER, valid)).toMatchObject({
      approval: "pending",
      linkable: true,
    });
    onFile("pending", "other");
    expect(await submitHackathon(MEMBER, valid)).toMatchObject({
      approval: "pending",
      linkable: false,
    });
    onFile("pending", "other");
    expect(await submitHackathon(OFFICER, valid)).toMatchObject({
      linkable: true,
    });
  });

  it("is a failure for a declined hackathon, even the submitter's own", async () => {
    onFile("declined", "member-1");
    expect((await failureOf(submitHackathon(MEMBER, valid))).message).toMatch(
      /declined/u,
    );
    onFile("declined", "other");
    await failureOf(submitHackathon(OFFICER, valid));
  });
});

describe("decideHackathon", () => {
  it("refuses a member before touching the database", async () => {
    await failureOf(decideHackathon(MEMBER, "h", "approved"));
    expect(mocks.calls).toEqual([]);
  });

  it("approves a pending member submission, recording the officer, and audits it", async () => {
    mocks.queue("tx.update", [
      {
        name: "Great Hack",
        url: "https://hack.example.com/",
        submittedBy: "m",
      },
    ]);
    await expect(decideHackathon(OFFICER, "h-1", "approved")).resolves.toEqual({
      name: "Great Hack",
    });
    const [set] = call("tx.update.set")[0]!.args as [Record<string, unknown>];
    expect(set).toMatchObject({
      approval: "approved",
      approvedBy: "officer-1",
    });
    const [audit] = call("tx.insert.values")[0]!.args;
    expect(audit).toMatchObject({
      actorType: "user",
      actorUserId: "officer-1",
      source: "platform",
      action: "hackathon.approved",
      targetType: "hackathon",
      targetId: "h-1",
      metadata: {
        name: "Great Hack",
        url: "https://hack.example.com/",
        submittedBy: "m",
      },
    });
  });

  it("records no approver on a decline, but still names the officer in the audit event", async () => {
    mocks.queue("tx.update", [{ name: "N", url: "u", submittedBy: null }]);
    await decideHackathon(OFFICER, "h-1", "declined");
    const [set] = call("tx.update.set")[0]!.args as [Record<string, unknown>];
    expect(set).toMatchObject({ approval: "declined", approvedBy: null });
    expect(call("tx.insert.values")[0]!.args[0]).toMatchObject({
      action: "hackathon.declined",
      actorUserId: "officer-1",
    });
  });

  it("fails, and writes no audit event, when nothing pending matched", async () => {
    mocks.queue("tx.update", []);
    const error = await failureOf(decideHackathon(OFFICER, "h-1", "approved"));
    expect(error.message).toBe("That hackathon was already decided.");
    expect(call("tx.insert.values")).toEqual([]);
  });
});
