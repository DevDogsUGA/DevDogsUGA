// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  caller: null as { userId: string; isLeader: boolean } | null,
}));
vi.mock("~/server/auth/access", () => {
  const rules = {
    officer: (caller: { isLeader: boolean }) => caller.isLeader,
  };
  const authorizeSession = () =>
    Promise.resolve(
      state.caller
        ? { ok: true, caller: state.caller }
        : { ok: false, message: "Session expected but not found." },
    );
  const authorize = async (rule: (caller: never) => boolean) => {
    const access = await authorizeSession();
    if (!access.ok) return access;
    return rule(access.caller as never)
      ? access
      : { ok: false, message: "Not authorized." };
  };
  return { rules, authorizeSession, authorize };
});

const mocks = vi.hoisted(() => ({
  revalidateOfficers: vi.fn(),
  resolveLinkTitle: vi.fn(
    (_url: string, supplied: string | null): Promise<string> =>
      Promise.resolve(supplied ?? "Fetched title"),
  ),
  /** What `update().returning()` yields: a row when the write found one. */
  updated: vi.fn<() => Promise<unknown[]>>(),
  transaction: vi.fn(),
}));
vi.mock("~/server/loaders/officers", () => ({
  revalidateOfficers: mocks.revalidateOfficers,
}));
vi.mock("~/server/profileLinkTitle", () => ({
  resolveLinkTitle: mocks.resolveLinkTitle,
}));

// Operators that keep their arguments, so a test can read which row a write
// was scoped to.
vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ and: parts }),
  asc: (column: unknown) => ({ asc: column }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown) => ({
    inArray: [column, values],
  }),
  isNull: (column: unknown) => ({ isNull: column }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join("?"),
    values,
  }),
}));
vi.mock("~/server/db/schema", () => ({
  profiles: { userId: "profiles.userId", quarantinedBy: "profiles.q" },
  profileLinks: {
    id: "links.id",
    userId: "links.userId",
    sortOrder: "links.sortOrder",
  },
}));

/** A query builder that returns itself from every method and awaits to `result`. */
function chain(result: unknown = []) {
  const builder: Record<string, unknown> = {};
  for (const method of [
    "from",
    "where",
    "for",
    "orderBy",
    "set",
    "values",
    "returning",
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    then: unknown;
  };
}

const writes = vi.hoisted((): { last: unknown } => ({ last: null }));
vi.mock("~/server/db", () => ({
  db: {
    update: () => {
      const builder = chain();
      builder.returning = vi.fn(() => mocks.updated());
      writes.last = builder;
      return builder;
    },
    transaction: mocks.transaction,
  },
}));

const { updateBio, updateIdentity, updateProfileLinks, updateRoleDescription } =
  await import("./profile");

const USER = "11111111-1111-4111-8111-111111111111";
const LINK = "22222222-2222-4222-8222-222222222222";
const OTHER_LINK = "33333333-3333-4333-8333-333333333333";

const written = () => writes.last as ReturnType<typeof chain>;
/** The row id the last write was scoped to. */
const scopedTo = () => JSON.stringify(written().where!.mock.calls[0]);

beforeEach(() => {
  vi.clearAllMocks();
  state.caller = { userId: USER, isLeader: false };
  mocks.updated.mockResolvedValue([{ userId: USER }]);
  writes.last = null;
});

describe("updateIdentity", () => {
  it("refuses a signed-out caller before writing", async () => {
    state.caller = null;
    expect(await updateIdentity({ preferredName: "Ada" })).toEqual({
      ok: false,
      message: "Session expected but not found.",
    });
    expect(writes.last).toBeNull();
  });

  it("returns every invalid field, keyed by the id the page uses", async () => {
    expect(
      await updateIdentity({ preferredName: "  ", pronouns: ["a", "a"] }),
    ).toEqual({
      ok: false,
      message: "Enter a preferred name.",
      fieldErrors: {
        preferredName: "Enter a preferred name.",
        pronouns: "Remove the duplicate pronoun.",
      },
    });
    expect(writes.last).toBeNull();
  });

  it("writes the trimmed name to the caller's own row only", async () => {
    expect(await updateIdentity({ preferredName: "  Ada  " })).toEqual({
      ok: true,
      data: { preferredName: "Ada" },
    });
    expect(written().set).toHaveBeenCalledWith({ preferredName: "Ada" });
    expect(scopedTo()).toContain(`"eq":["profiles.userId","${USER}"]`);
    expect(scopedTo()).toContain("profiles.q");
    expect(scopedTo()).toContain("is_suspended");
  });

  it("leaves a field alone when it is not sent", async () => {
    await updateIdentity({ pronouns: ["she", "her"] });
    expect(written().set).toHaveBeenCalledWith({ pronouns: ["she", "her"] });
  });

  it("writes nothing when nothing is sent", async () => {
    expect(await updateIdentity({})).toEqual({ ok: true, data: {} });
    expect(writes.last).toBeNull();
  });

  it("refuses when the row is frozen or suspended", async () => {
    mocks.updated.mockResolvedValue([]);
    expect(await updateIdentity({ preferredName: "Ada" })).toEqual({
      ok: false,
      message: "This profile can't be edited right now.",
    });
    expect(mocks.revalidateOfficers).not.toHaveBeenCalled();
  });

  it("invalidates the board for an officer only", async () => {
    await updateIdentity({ preferredName: "Ada" });
    expect(mocks.revalidateOfficers).not.toHaveBeenCalled();

    state.caller = { userId: USER, isLeader: true };
    await updateIdentity({ pronouns: ["they"] });
    expect(mocks.revalidateOfficers).toHaveBeenCalledTimes(1);
  });
});

describe("updateBio", () => {
  it("refuses a signed-out caller before writing", async () => {
    state.caller = null;
    expect(await updateBio("hi")).toMatchObject({ ok: false });
    expect(writes.last).toBeNull();
  });

  it("returns the field error under the bio field", async () => {
    expect(await updateBio("x".repeat(200))).toMatchObject({
      ok: false,
      fieldErrors: { bio: expect.stringMatching(/127 characters/) as unknown },
    });
    expect(writes.last).toBeNull();
  });

  it("writes the normalised bio to the caller's row and returns it", async () => {
    expect(await updateBio("  hello   there \n\n friend ")).toEqual({
      ok: true,
      data: "hello there\nfriend",
    });
    expect(written().set).toHaveBeenCalledWith({
      bio: "hello there\nfriend",
    });
    expect(scopedTo()).toContain(`"eq":["profiles.userId","${USER}"]`);
  });

  it("stores a blank bio as null, and never invalidates the board", async () => {
    state.caller = { userId: USER, isLeader: true };
    expect(await updateBio("  \n ")).toEqual({ ok: true, data: "" });
    expect(written().set).toHaveBeenCalledWith({ bio: null });
    expect(mocks.revalidateOfficers).not.toHaveBeenCalled();
  });
});

describe("updateRoleDescription", () => {
  beforeEach(() => {
    state.caller = { userId: USER, isLeader: true };
  });

  it("refuses a signed-out caller before writing", async () => {
    state.caller = null;
    expect(await updateRoleDescription("Runs it")).toMatchObject({
      ok: false,
    });
    expect(writes.last).toBeNull();
  });

  it("refuses a member who is not an officer", async () => {
    state.caller = { userId: USER, isLeader: false };
    expect(await updateRoleDescription("Runs it")).toEqual({
      ok: false,
      message: "Not authorized.",
    });
    expect(writes.last).toBeNull();
  });

  it("returns the field error under the role description field", async () => {
    expect(await updateRoleDescription("two  spaces")).toEqual({
      ok: false,
      message: "Use only one space between words in your role description.",
      fieldErrors: {
        roleDescription:
          "Use only one space between words in your role description.",
      },
    });
    expect(writes.last).toBeNull();
  });

  it("writes the trimmed text to the officer's own row and invalidates the board", async () => {
    expect(await updateRoleDescription(" Runs the club ")).toEqual({
      ok: true,
      data: "Runs the club",
    });
    expect(written().set).toHaveBeenCalledWith({
      roleDescription: "Runs the club",
    });
    expect(scopedTo()).toContain(`"eq":["profiles.userId","${USER}"]`);
    expect(mocks.revalidateOfficers).toHaveBeenCalledTimes(1);
  });

  it("stores a blank description as null", async () => {
    await updateRoleDescription(" ");
    expect(written().set).toHaveBeenCalledWith({ roleDescription: null });
  });
});

describe("updateProfileLinks", () => {
  const row = (id: string, sortOrder: number) => ({
    id,
    userId: USER,
    url: `https://example.com/${sortOrder}`,
    title: `Link ${sortOrder}`,
    sortOrder,
  });

  /** Runs the transaction callback against scripted reads. */
  function transaction(
    existing: ReturnType<typeof row>[],
    status = { frozen: false, suspended: false },
    after: ReturnType<typeof row>[] = existing,
  ) {
    const tx = {
      select: vi
        .fn()
        .mockImplementationOnce(() => chain([status]))
        .mockImplementationOnce(() => chain(existing))
        .mockImplementationOnce(() => chain(after)),
      update: vi.fn(() => chain()),
      delete: vi.fn(() => chain()),
      insert: vi.fn(() => chain()),
    };
    mocks.transaction.mockImplementation((work: (tx: unknown) => unknown) =>
      work(tx),
    );
    return tx;
  }

  const none = { remove: [], update: [], add: [] };

  it("refuses a signed-out caller before opening a transaction", async () => {
    state.caller = null;
    expect(await updateProfileLinks(none)).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a malformed request without touching the database", async () => {
    expect(
      await updateProfileLinks({ remove: ["nope"], update: [], add: [] }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { links: expect.any(String) as unknown },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a non-http address under the links field, before any fetch", async () => {
    expect(
      await updateProfileLinks({
        remove: [],
        update: [],
        add: [{ url: "javascript:alert(1)", title: null, sortOrder: 1 }],
      }),
    ).toEqual({
      ok: false,
      message: "Enter a full http:// or https:// URL.",
      fieldErrors: { links: "Enter a full http:// or https:// URL." },
    });
    expect(mocks.resolveLinkTitle).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a title longer than the column", async () => {
    expect(
      await updateProfileLinks({
        remove: [],
        update: [],
        add: [
          { url: "https://a.example", title: "t".repeat(65), sortOrder: 1 },
        ],
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { links: expect.stringMatching(/64 characters/) as unknown },
    });
  });

  it("refuses when the row is frozen or suspended, writing nothing", async () => {
    const tx = transaction([], { frozen: true, suspended: false });
    expect(
      await updateProfileLinks({
        ...none,
        add: [{ url: "https://a.example", title: "A", sortOrder: 1 }],
      }),
    ).toEqual({
      ok: false,
      message: "This profile can't be edited right now.",
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("refuses a link the caller does not own, writing nothing", async () => {
    const tx = transaction([row(LINK, 1)]);
    expect(
      await updateProfileLinks({ ...none, remove: [OTHER_LINK] }),
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        links: expect.stringMatching(/changed somewhere else/) as unknown,
      },
    });
    expect(tx.delete).not.toHaveBeenCalled();
    expect(mocks.revalidateOfficers).not.toHaveBeenCalled();
  });

  it("refuses a sixth link", async () => {
    const full = [1, 2, 3, 4, 5].map((n) => row(`id-${n}`, n));
    const tx = transaction(full);
    expect(
      await updateProfileLinks({
        ...none,
        add: [{ url: "https://six.example", title: null, sortOrder: 6 }],
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { links: "You can only add up to 5 links." },
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("refuses two links at one position", async () => {
    const tx = transaction([row(LINK, 1)]);
    expect(
      await updateProfileLinks({
        ...none,
        add: [{ url: "https://a.example", title: null, sortOrder: 1 }],
      }),
    ).toMatchObject({ ok: false });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("deletes, parks and rewrites, and inserts new links with their resolved titles", async () => {
    const saved = [row(LINK, 1), row("new", 3)];
    const tx = transaction(
      [row(LINK, 1), row(OTHER_LINK, 2)],
      undefined,
      saved,
    );
    const result = await updateProfileLinks({
      remove: [OTHER_LINK],
      update: [
        { id: LINK, url: "https://renamed.example", title: null, sortOrder: 1 },
      ],
      add: [{ url: "https://new.example", title: null, sortOrder: 3 }],
    });

    expect(result).toEqual({ ok: true, data: saved });
    expect(tx.delete).toHaveBeenCalledTimes(1);
    // One write to park the link past every position, one for its real values.
    expect(tx.update).toHaveBeenCalledTimes(2);
    const [park, rewrite] = tx.update.mock.results.map(
      (r) => r.value as ReturnType<typeof chain>,
    );
    expect(park!.set).toHaveBeenCalledWith({ sortOrder: 4 });
    expect(rewrite!.set).toHaveBeenCalledWith({
      url: "https://renamed.example",
      title: "renamed.example",
      sortOrder: 1,
    });
    const inserted = tx.insert.mock.results[0]!.value as ReturnType<
      typeof chain
    >;
    expect(inserted.values).toHaveBeenCalledWith([
      {
        userId: USER,
        url: "https://new.example",
        title: "Fetched title",
        sortOrder: 3,
      },
    ]);
  });

  it("scopes every write to the caller's own links", async () => {
    const tx = transaction([row(LINK, 1), row(OTHER_LINK, 2)]);
    await updateProfileLinks({
      remove: [OTHER_LINK],
      update: [
        { id: LINK, url: "https://a.example", title: "A", sortOrder: 5 },
      ],
      add: [],
    });
    const scoped = [...tx.delete.mock.results, ...tx.update.mock.results].map(
      (r) =>
        JSON.stringify((r.value as ReturnType<typeof chain>).where!.mock.calls),
    );
    expect(scoped).toHaveLength(3);
    for (const where of scoped)
      expect(where).toContain(`"eq":["links.userId","${USER}"]`);
  });

  it("invalidates the board for an officer only", async () => {
    transaction([]);
    await updateProfileLinks({
      ...none,
      add: [{ url: "https://a.example", title: "A", sortOrder: 1 }],
    });
    expect(mocks.revalidateOfficers).not.toHaveBeenCalled();

    state.caller = { userId: USER, isLeader: true };
    transaction([]);
    await updateProfileLinks({
      ...none,
      add: [{ url: "https://a.example", title: "A", sortOrder: 1 }],
    });
    expect(mocks.revalidateOfficers).toHaveBeenCalledTimes(1);
  });
});
