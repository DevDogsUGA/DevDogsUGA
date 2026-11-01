// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  authorizeSession: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateShowcase: vi.fn(),
  store: {
    addOwner: vi.fn(),
    archiveProject: vi.fn(),
    createProject: vi.fn(),
    decideRepoLink: vi.fn(),
    deleteProject: vi.fn(),
    linkRepo: vi.fn(),
    makeDevdogsOwned: vi.fn(),
    removeOwner: vi.fn(),
    setAdvisor: vi.fn(),
    unarchiveProject: vi.fn(),
    unlinkRepo: vi.fn(),
    updateProject: vi.fn(),
  },
  reports: {
    deleteReport: vi.fn(),
    fileReport: vi.fn(),
    reviewReport: vi.fn(),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("~/server/auth/access", () => ({
  authorize: mocks.authorize,
  authorizeSession: mocks.authorizeSession,
  rules: { officer: "officer-rule" },
}));
vi.mock("~/server/projects/showcase", () => ({
  revalidateShowcase: mocks.revalidateShowcase,
}));
vi.mock("~/server/projects/store", () => mocks.store);
vi.mock("~/server/projects/reports", () => mocks.reports);

const actions = await import("./projects");

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CALLER = { userId: OTHER };
const ok = { ok: true };
const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorizeSession.mockResolvedValue({ ok: true, caller: CALLER });
  mocks.authorize.mockResolvedValue({ ok: true, caller: CALLER });
  for (const fn of [
    ...Object.values(mocks.store),
    ...Object.values(mocks.reports),
  ])
    fn.mockResolvedValue(ok);
});

describe("every action authorizes before it does anything", () => {
  const signedOut = { ok: false, message: "Session expected but not found." };
  it("refuses a signed-out caller", async () => {
    mocks.authorizeSession.mockResolvedValue(signedOut);
    const results = await Promise.all([
      actions.createProjectAction(form([["name", "x"]])),
      actions.updateProjectAction(ID, { name: "n", description: "", tags: "" }),
      actions.linkRepoAction(
        form([
          ["projectId", ID],
          ["repo", "a/b"],
        ]),
      ),
      actions.unlinkRepoAction(ID, "1"),
      actions.addOwnerAction(ID, OTHER),
      actions.removeOwnerAction(ID, OTHER),
      actions.archiveProjectAction(ID),
      actions.unarchiveProjectAction(ID),
      actions.deleteProjectAction(ID),
      actions.fileReportAction(form([["projectId", ID]])),
      actions.deleteReportAction(ID),
      actions.reviewReportAction(form([["reportId", ID]])),
    ]);
    for (const result of results) expect(result).toEqual(signedOut);
    for (const fn of [
      ...Object.values(mocks.store),
      ...Object.values(mocks.reports),
    ])
      expect(fn).not.toHaveBeenCalled();
  });

  it("gates the officer-only actions on the officer rule", async () => {
    const denied = { ok: false, message: "Not authorized." };
    mocks.authorize.mockResolvedValue(denied);
    expect(await actions.decideRepoLinkAction(ID, "1", "approve")).toEqual(
      denied,
    );
    expect(await actions.setAdvisorAction(ID, OTHER)).toEqual(denied);
    expect(await actions.makeDevdogsOwnedAction(ID)).toEqual(denied);
    expect(mocks.authorize).toHaveBeenCalledWith("officer-rule");
    expect(mocks.store.decideRepoLink).not.toHaveBeenCalled();
    expect(mocks.store.setAdvisor).not.toHaveBeenCalled();
    expect(mocks.store.makeDevdogsOwned).not.toHaveBeenCalled();
  });
});

describe("input", () => {
  it("is validated before the domain module is called", async () => {
    const invalid = { ok: false, message: "That request is invalid." };
    expect(await actions.archiveProjectAction("nope")).toEqual(invalid);
    expect(await actions.unlinkRepoAction(ID, "0")).toEqual(invalid);
    expect(await actions.addOwnerAction(ID, "nope")).toEqual(invalid);
    expect(
      await actions.decideRepoLinkAction(ID, "1", "maybe" as never),
    ).toEqual(invalid);
    expect(await actions.setAdvisorAction(ID, "nope")).toEqual(invalid);
    expect(mocks.store.archiveProject).not.toHaveBeenCalled();
    expect(mocks.store.unlinkRepo).not.toHaveBeenCalled();
  });

  it("clears the advisor with null", async () => {
    await actions.setAdvisorAction(ID, null);
    expect(mocks.store.setAdvisor).toHaveBeenCalledWith(CALLER, ID, null);
  });

  it("collects every cited sha from the report form", async () => {
    await actions.fileReportAction(
      form([
        ["projectId", ID],
        ["reportId", ""],
        ["startDate", "2026-10-01"],
        ["endDate", "2026-10-14"],
        ["hours", "6.5"],
        ["content", "words"],
        ["sha", "a".repeat(40)],
        ["sha", "b".repeat(40)],
      ]),
    );
    expect(mocks.reports.fileReport).toHaveBeenCalledWith(CALLER, {
      projectId: ID,
      startDate: "2026-10-01",
      endDate: "2026-10-14",
      hours: 6.5,
      content: "words",
      shas: ["a".repeat(40), "b".repeat(40)],
    });
  });

  it("reads the review intent from the submitting button", async () => {
    await actions.reviewReportAction(
      form([
        ["reportId", ID],
        ["intent", "approve"],
        ["hours", "5.5"],
      ]),
    );
    expect(mocks.reports.reviewReport).toHaveBeenLastCalledWith(CALLER, ID, {
      action: "approve",
      hours: 5.5,
    });
    await actions.reviewReportAction(
      form([
        ["reportId", ID],
        ["intent", "return"],
        ["hours", ""],
        ["note", "More"],
      ]),
    );
    expect(mocks.reports.reviewReport).toHaveBeenLastCalledWith(CALLER, ID, {
      action: "return",
      note: "More",
    });
  });
});

describe("revalidation", () => {
  it("follows a success and only a success", async () => {
    mocks.store.archiveProject.mockResolvedValue({ ok: false, message: "No." });
    await actions.archiveProjectAction(ID);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidateShowcase).not.toHaveBeenCalled();
    mocks.store.archiveProject.mockResolvedValue(ok);
    await actions.archiveProjectAction(ID);
    // An archive can take a featured project off the homepage, so the
    // showcase refreshes with the dashboard pages.
    expect(mocks.revalidateShowcase).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/projects");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/reviews");
  });

  it("passes the domain's result straight through", async () => {
    const refusal = {
      ok: false,
      message: "A project keeps at least one owner.",
    };
    mocks.store.removeOwner.mockResolvedValue(refusal);
    expect(await actions.removeOwnerAction(ID, OTHER)).toBe(refusal);
  });
});
