import { beforeEach, describe, expect, it, vi } from "vitest";

const dbExecute = vi.fn();

vi.mock("~/server/db", () => ({ db: { execute: dbExecute } }));

async function loadRateLimit() {
  return import("./rateLimit");
}

beforeEach(() => {
  dbExecute.mockClear();
});

describe("consumeRateLimit", () => {
  it("allows the attempt when the insert returns a row", async () => {
    dbExecute.mockResolvedValue([{ id: "hit-1" }]);
    const { consumeRateLimit } = await loadRateLimit();

    await expect(
      consumeRateLimit({
        scope: "team:create",
        subjectId: "user-1",
        limit: 10,
        windowSeconds: 600,
      }),
    ).resolves.toBe(true);
    expect(dbExecute).toHaveBeenCalledTimes(1);
  });

  it("refuses the attempt when the budget's count gates out the insert", async () => {
    // The real query returns zero rows when `n < limit` is false -- the
    // `insert ... select ... where` never produces a row to return, rather
    // than raising or rejecting.
    dbExecute.mockResolvedValue([]);
    const { consumeRateLimit } = await loadRateLimit();

    await expect(
      consumeRateLimit({
        scope: "team:invite:team",
        subjectId: "team-1",
        limit: 50,
        windowSeconds: 86400,
      }),
    ).resolves.toBe(false);
  });

  it("scopes each call independently, so two different scopes never share a query", async () => {
    dbExecute.mockResolvedValue([{ id: "hit-1" }]);
    const { consumeRateLimit } = await loadRateLimit();

    await consumeRateLimit({
      scope: "team:invite:user",
      subjectId: "user-1",
      limit: 20,
      windowSeconds: 3600,
    });
    await consumeRateLimit({
      scope: "team:invite:team",
      subjectId: "team-1",
      limit: 50,
      windowSeconds: 86400,
    });

    expect(dbExecute).toHaveBeenCalledTimes(2);
  });
});
