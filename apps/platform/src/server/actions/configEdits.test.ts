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
vi.mock("~/server/actions/permissions", () => ({ isOfficer: mocks.isOfficer }));
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

const USER = "11111111-1111-4111-8111-111111111111";
const initial = { ok: false, message: "" };

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

const meetingForm = (over: Record<string, string> = {}) =>
  form({
    collection: "meeting",
    key: "2026-09-14",
    f_slug: "2026-09-14",
    f_title: "Cold Start",
    f_summary:
      "The inaugural meeting for the 2026-2027 school year. Get set up to contribute to this year's projects! We've simplified the onboarding process this year, and we're excited to get everyone rocking and rolling for the rest of the semester.",
    f_category: "milestone",
    f_venue: "dlw",
    f_room: "200",
    f_startsAt: "2026-09-14T18:00",
    f_endsAt: "2026-09-14T19:30",
    f_rsvpUrl: "https://uga.campuslabs.com/engage/event/12664196",
    f_agenda: "collaborative-coding",
    ...over,
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
    expect((await saveConfigEditAction(initial, meetingForm())).ok).toBe(false);
    expect(
      (
        await resetConfigEditAction(
          initial,
          form({ collection: "meeting", key: "x" }),
        )
      ).ok,
    ).toBe(false);
    expect((await resetAllConfigEditsAction()).ok).toBe(false);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
    expect(mocks.resetEdit).not.toHaveBeenCalled();
    expect(mocks.resetAllEdits).not.toHaveBeenCalled();
  });

  it("passes the caller's own id, never one from the form", async () => {
    await saveConfigEditAction(
      initial,
      meetingForm({ userId: "someone-else" }),
    );
    expect(mocks.saveEdit.mock.calls[0]![0]).toBe(USER);
  });
});

describe("saveConfigEditAction", () => {
  it("stores only the changed fields", async () => {
    const state = await saveConfigEditAction(initial, meetingForm());
    expect(state.ok).toBe(true);
    expect(mocks.saveEdit).toHaveBeenCalledWith(USER, {
      collection: "meeting",
      key: "2026-09-14",
      isNew: false,
      fields: { room: "200" },
    });
  });

  it("refuses a time that is not a time", async () => {
    const state = await saveConfigEditAction(
      initial,
      meetingForm({ f_startsAt: "later" }),
    );
    expect(state.ok).toBe(false);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("will not create a meeting whose slug already exists, or one badly named", async () => {
    const dup = await saveConfigEditAction(
      initial,
      meetingForm({ isNew: "1", key: "new", f_slug: "2026-09-14" }),
    );
    expect(dup.message).toMatch(/already exists/);
    const bad = await saveConfigEditAction(
      initial,
      meetingForm({ isNew: "1", key: "new", f_slug: "Monday" }),
    );
    expect(bad.message).toMatch(/Eastern date/);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("will not edit an item the official config does not have", async () => {
    const state = await saveConfigEditAction(
      initial,
      meetingForm({ key: "2020-01-01", f_slug: "2020-01-01" }),
    );
    expect(state.ok).toBe(false);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("reserves 'new' as an id", async () => {
    const state = await saveConfigEditAction(
      initial,
      form({
        collection: "workshop",
        isNew: "1",
        key: "new",
        f_id: "new",
        f_title: "X",
        f_elHours: "1",
      }),
    );
    expect(state.message).toMatch(/reserved/);
  });

  it("rejects an unknown collection", async () => {
    const state = await saveConfigEditAction(
      initial,
      form({ collection: "roles" }),
    );
    expect(state.ok).toBe(false);
  });
});

describe("resetConfigEditAction and openConfigPrAction", () => {
  it("resets one item for the caller", async () => {
    const state = await resetConfigEditAction(
      initial,
      form({ collection: "venue", key: "dlw" }),
    );
    expect(state.ok).toBe(true);
    expect(mocks.resetEdit).toHaveBeenCalledWith(USER, "venue", "dlw");
  });

  it("words each way opening can end", async () => {
    mocks.openConfigPr.mockResolvedValueOnce({
      status: "opened",
      url: "https://github.com/x/y/pull/1",
      draft: false,
    });
    expect(await openConfigPrAction()).toMatchObject({
      ok: true,
      url: "https://github.com/x/y/pull/1",
    });
    mocks.openConfigPr.mockResolvedValueOnce({
      status: "invalid",
      errors: ["a: bad"],
    });
    expect(await openConfigPrAction()).toMatchObject({
      ok: false,
      errors: ["a: bad"],
    });
    mocks.openConfigPr.mockResolvedValueOnce({ status: "unavailable" });
    expect((await openConfigPrAction()).message).toMatch(/not set up/);
    mocks.openConfigPr.mockResolvedValueOnce({ status: "rate_limited" });
    expect((await openConfigPrAction()).message).toMatch(/three pull requests/);
  });
});
