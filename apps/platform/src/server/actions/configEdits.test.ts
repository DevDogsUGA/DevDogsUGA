import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  expectSession: vi.fn(),
  isOfficer: vi.fn(),
  saveEdit: vi.fn(),
  resetEdit: vi.fn(),
  resetAllEdits: vi.fn(),
  openConfigPr: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("~/server/auth", () => ({ expectSession: mocks.expectSession }));
vi.mock("~/server/auth/permissions", () => ({
  getCallerContext: async () => ({
    resolvedPermissions: {},
    isLeader: Boolean(await mocks.isOfficer()),
    minRank: 100,
  }),
}));
vi.mock("~/server/config/editsStore", () => ({
  saveEdit: mocks.saveEdit,
  resetEdit: mocks.resetEdit,
  resetAllEdits: mocks.resetAllEdits,
}));
vi.mock("~/server/config/proposals", () => ({
  openConfigPr: mocks.openConfigPr,
}));

const {
  openConfigPrAction,
  resetAllConfigEditsAction,
  resetConfigEditAction,
  saveConfigEditAction,
} = await import("./configEdits");
type ConfigEditInput = Parameters<typeof saveConfigEditAction>[0];

const USER = "11111111-1111-4111-8111-111111111111";

/** The refusal in a result, failing the test if it succeeded. */
function refusal(result: { ok: boolean }) {
  if (result.ok) throw new Error("Expected a refusal, got success.");
  return result as {
    ok: false;
    message: string;
    fieldErrors?: Record<string, string>;
  };
}

const MEETING_VALUES = {
  slug: "2026-09-14",
  title: "Cold Start",
  summary:
    "The inaugural meeting for the 2026-2027 school year. Get set up to contribute to this year's projects! We've simplified the onboarding process this year, and we're excited to get everyone rocking and rolling for the rest of the semester.",
  category: "milestone",
  venue: "dlw",
  room: "200",
  startsAt: "2026-09-14T18:00",
  endsAt: "2026-09-14T19:30",
  rsvpUrl: "https://uga.campuslabs.com/engage/event/12664196",
  agenda: "collaborative-coding",
};

/** The item form's input: the meeting's own text, with `values` overridden. */
const meetingInput = (
  over: Partial<ConfigEditInput> & { values?: Record<string, string> } = {},
): ConfigEditInput => ({
  collection: "meeting",
  key: "2026-09-14",
  isNew: false,
  ...over,
  values: { ...MEETING_VALUES, ...over.values },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.expectSession.mockResolvedValue(USER);
  mocks.isOfficer.mockResolvedValue(true);
  mocks.saveEdit.mockResolvedValue("saved");
  mocks.resetAllEdits.mockResolvedValue(2);
});

describe("permissions", () => {
  it("lets a non-officer neither save, reset nor open", async () => {
    mocks.isOfficer.mockResolvedValue(false);
    expect((await saveConfigEditAction(meetingInput())).ok).toBe(false);
    expect((await resetConfigEditAction("meeting", "x")).ok).toBe(false);
    expect((await resetAllConfigEditsAction()).ok).toBe(false);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
    expect(mocks.resetEdit).not.toHaveBeenCalled();
    expect(mocks.resetAllEdits).not.toHaveBeenCalled();
  });

  it("passes the caller's own id, never one from the input", async () => {
    await saveConfigEditAction({
      ...meetingInput(),
      userId: "someone-else",
    } as ConfigEditInput);
    expect(mocks.saveEdit.mock.calls[0]![0]).toBe(USER);
  });
});

describe("saveConfigEditAction", () => {
  it("stores only the changed fields", async () => {
    const result = await saveConfigEditAction(meetingInput());
    expect(result).toMatchObject({ ok: true, data: { cleared: false } });
    expect(mocks.saveEdit).toHaveBeenCalledWith(USER, {
      collection: "meeting",
      key: "2026-09-14",
      isNew: false,
      fields: { room: "200" },
    });
  });

  it("succeeds with cleared when no differences remain, and says nothing is saved", async () => {
    mocks.saveEdit.mockResolvedValue("cleared");
    const result = await saveConfigEditAction(
      meetingInput({ values: { room: "124" } }),
    );
    expect(result).toMatchObject({ ok: true, data: { cleared: true } });
    expect(result.ok && result.message).toMatch(/nothing is saved/);
  });

  it("refuses a time that is not a time, under that field", async () => {
    const result = await saveConfigEditAction(
      meetingInput({ values: { startsAt: "later" } }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { startsAt: "Starts is not a valid date and time." },
    });
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("returns every problem at once, keyed by field name", async () => {
    const result = await saveConfigEditAction(
      meetingInput({ values: { startsAt: "later", endsAt: "" } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toEqual({
      startsAt: "Starts is not a valid date and time.",
      endsAt: "Ends is required.",
    });
    expect(result.message).toBe("Starts is not a valid date and time.");
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("will not create a meeting whose slug already exists, or one badly named", async () => {
    const dup = refusal(
      await saveConfigEditAction(
        meetingInput({
          isNew: true,
          key: "new",
          values: { slug: "2026-09-14" },
        }),
      ),
    );
    expect(dup.message).toMatch(/already exists/);
    expect(dup.fieldErrors?.slug).toMatch(/already exists/);
    const bad = refusal(
      await saveConfigEditAction(
        meetingInput({ isNew: true, key: "new", values: { slug: "Monday" } }),
      ),
    );
    expect(bad.message).toMatch(/Eastern date/);
    expect(bad.fieldErrors?.slug).toMatch(/Eastern date/);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("will not edit an item the official config does not have", async () => {
    const result = await saveConfigEditAction(
      meetingInput({ key: "2020-01-01", values: { slug: "2020-01-01" } }),
    );
    expect(result.ok).toBe(false);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("refuses an edit that is too long to store, and one past the saved-edit limit", async () => {
    const long = refusal(
      await saveConfigEditAction(
        meetingInput({
          values: {
            summary: "x".repeat(5000),
            room: "y".repeat(5000),
            agenda: "z".repeat(5000),
          },
        }),
      ),
    );
    expect(long.message).toMatch(/too long/);
    mocks.saveEdit.mockResolvedValue("too_many");
    const many = refusal(await saveConfigEditAction(meetingInput()));
    expect(many.message).toMatch(/too many saved edits/);
  });

  it("reserves 'new' as an id", async () => {
    const result = refusal(
      await saveConfigEditAction({
        collection: "workshop",
        isNew: true,
        key: "new",
        values: { id: "new", title: "X", elHours: "1" },
      }),
    );
    expect(result.message).toMatch(/reserved/);
  });

  it("rejects an unknown collection", async () => {
    const result = await saveConfigEditAction({
      collection: "roles",
      key: "x",
      isNew: false,
      values: {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("resetConfigEditAction and openConfigPrAction", () => {
  it("resets one item for the caller", async () => {
    const result = await resetConfigEditAction("venue", "dlw");
    expect(result).toMatchObject({ ok: true, message: "Reset to official." });
    expect(mocks.resetEdit).toHaveBeenCalledWith(USER, "venue", "dlw");
  });

  it("resets everything, and says when there was nothing to reset", async () => {
    expect(await resetAllConfigEditsAction()).toMatchObject({
      ok: true,
      message: "Everything is back to official.",
    });
    mocks.resetAllEdits.mockResolvedValueOnce(0);
    expect(await resetAllConfigEditsAction()).toMatchObject({
      ok: true,
      message: "Nothing to reset.",
    });
  });

  it("refuses to open a pull request for a non-officer", async () => {
    mocks.isOfficer.mockResolvedValue(false);
    expect(await openConfigPrAction()).toMatchObject({ ok: false });
    expect(mocks.openConfigPr).not.toHaveBeenCalled();
  });

  it("refuses a reset for an unknown collection", async () => {
    expect((await resetConfigEditAction("roles", "dlw")).ok).toBe(false);
    expect(mocks.resetEdit).not.toHaveBeenCalled();
  });

  it("words each way opening can end", async () => {
    mocks.openConfigPr.mockResolvedValueOnce({
      status: "opened",
      url: "https://github.com/x/y/pull/1",
      draft: false,
    });
    expect(await openConfigPrAction()).toMatchObject({
      ok: true,
      data: { url: "https://github.com/x/y/pull/1" },
      message: expect.stringMatching(/Opened a pull request/) as unknown,
    });
    mocks.openConfigPr.mockResolvedValueOnce({
      status: "invalid",
      errors: ["a: bad"],
    });
    expect(await openConfigPrAction()).toMatchObject({
      ok: false,
      fieldErrors: { "0": "a: bad" },
    });
    mocks.openConfigPr.mockResolvedValueOnce({ status: "unavailable" });
    expect(await openConfigPrAction()).toMatchObject({
      ok: false,
      message: expect.stringMatching(/not set up/) as unknown,
    });
    mocks.openConfigPr.mockResolvedValueOnce({ status: "rate_limited" });
    expect(await openConfigPrAction()).toMatchObject({
      ok: false,
      message: expect.stringMatching(/three pull request attempts/) as unknown,
    });
    mocks.openConfigPr.mockResolvedValueOnce({
      status: "github_error",
      message: "403",
    });
    expect(await openConfigPrAction()).toMatchObject({
      ok: false,
      message: expect.stringContaining("(403)") as unknown,
    });
    mocks.openConfigPr.mockResolvedValueOnce({ status: "nothing_to_propose" });
    expect(await openConfigPrAction()).toMatchObject({
      ok: false,
      message: "Nothing differs from the official config.",
    });
  });
});
