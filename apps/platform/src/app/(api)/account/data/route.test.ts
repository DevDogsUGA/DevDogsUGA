import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(
  (): {
    session: string | null;
    build: ReturnType<typeof vi.fn>;
    inserted: unknown[];
  } & { limit: { allowed: boolean } } => ({
    session: "member-1",
    build: vi.fn(),
    inserted: [],
    limit: { allowed: true },
  }),
);

vi.mock("~/server/auth", () => ({
  expectSession: () =>
    fake.session
      ? Promise.resolve(fake.session)
      : Promise.reject(new Error("Session expected but not found.")),
}));
vi.mock("~/server/accountData/build", () => ({
  buildMemberDataExport: fake.build,
}));
vi.mock("~/server/rateLimit", () => ({
  consumeRateLimit: () => Promise.resolve(fake.limit.allowed),
}));
vi.mock("~/server/db", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => {
        fake.inserted.push(row);
        return Promise.resolve();
      },
    }),
  },
}));

const { GET } = await import("./route");

beforeEach(() => {
  fake.session = "member-1";
  fake.inserted = [];
  fake.limit.allowed = true;
  fake.build.mockReset();
  fake.build.mockResolvedValue({
    exportedAt: "2026-10-23T12:00:00.000Z",
    profile: { preferredName: "Sam" },
  });
});

describe("GET /account/data", () => {
  it("turns away a visitor with no session, and reads nothing", async () => {
    fake.session = null;
    const response = await GET();
    expect(response.status).toBe(401);
    expect(fake.build).not.toHaveBeenCalled();
    expect(fake.inserted).toEqual([]);
  });

  it("builds the file for the session's member and nobody else", async () => {
    const response = await GET();

    expect(fake.build).toHaveBeenCalledTimes(1);
    expect(fake.build).toHaveBeenCalledWith("member-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="devdogs-my-data-2026-10-23.json"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.parse(await response.text())).toMatchObject({
      profile: { preferredName: "Sam" },
    });
  });

  it("audits the download with the member as actor", async () => {
    await GET();
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0]).toMatchObject({
      actorType: "user",
      actorUserId: "member-1",
      action: "user.data_exported",
      targetType: "user",
      targetId: "member-1",
    });
  });
});

describe("GET /account/data rate limit", () => {
  it("answers 429 and builds nothing when the budget is spent", async () => {
    fake.limit.allowed = false;
    const res = await GET();
    expect(res.status).toBe(429);
    expect(fake.build).not.toHaveBeenCalled();
    expect(fake.inserted).toEqual([]);
  });
});
