// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";
import type { Caller } from "~/server/auth/access";
import type {
  TrustedPrInput,
  TrustedPrResult,
} from "~/server/config/trustedFilePr";
import {
  proposalBranch,
  proposeDocsChange,
  recordPublications,
  reconcileDocsProposals,
  type DocsChange,
  type DocsDeps,
  type DocsProjectRow,
  type DocsRepoRow,
  type DocsStore,
  type MapDetail,
  type NewProposal,
  type ProposalRow,
  type PullState,
} from "./docsProposals";
import {
  parseProjectMap,
  serializeProjectMap,
  type ProjectMap,
} from "./projectMap";

vi.mock("~/server/auth/access", () => ({
  rules: { officer: (caller: { isLeader: boolean }) => caller.isLeader },
}));

const SHA = "a".repeat(40);
const PROJECT = "33333333-3333-4333-8333-333333333333";
const OFFICER = {
  userId: "officer-1",
  isLeader: true,
  flags: {},
  minRank: 1,
} as unknown as Caller;
const MEMBER = {
  userId: "member-1",
  isLeader: false,
  flags: {},
  minRank: 99,
} as unknown as Caller;

const REPO: DocsRepoRow = {
  githubRepoId: "9001",
  ownerId: "42",
  owner: "DevDogsUGA",
  name: "example",
  approved: true,
  available: true,
};
const ENTRY = { githubRepoId: "9001", ownerId: "42", ownerLogin: "DevDogsUGA" };

const mapText = (projects: ProjectMap["projects"] = {}) =>
  serializeProjectMap({ comment: "notes", projects });

/** An in-memory `DocsStore` with the same in-flight rule as the database. */
function memoryStore(initial: {
  project?: Partial<DocsProjectRow> | null;
  repos?: DocsRepoRow[];
}) {
  const state: {
    project: DocsProjectRow | null;
    repos: DocsRepoRow[];
    proposals: (ProposalRow & { baseSha: string; lastError: string | null })[];
    audits: unknown[];
    published: string[];
  } = {
    project:
      initial.project === null
        ? null
        : {
            id: PROJECT,
            name: "Example",
            slug: "example",
            docsRepoId: null,
            docsRequested: false,
            docsPausedAt: null,
            docsFirstPublishedAt: null,
            ...initial.project,
          },
    repos: initial.repos ?? [REPO],
    proposals: [] as (ProposalRow & {
      baseSha: string;
      lastError: string | null;
    })[],
    audits: [] as unknown[],
    published: [] as string[],
  };
  const inFlight = (row: ProposalRow) =>
    row.state === "opening" || row.state === "open";
  const store: DocsStore = {
    loadProject: async () =>
      state.project ? { project: state.project, repos: state.repos } : null,
    activeProposal: async () => state.proposals.find(inFlight) ?? null,
    beginProposal: async (p: NewProposal) => {
      const mine = state.proposals.find((row) => row.id === p.id);
      if (mine) {
        if (mine.state !== "opening")
          throw new ExpectedFailure(
            "That docs pull request has already been opened.",
          );
        mine.baseSha = p.baseSha;
      } else {
        if (state.proposals.some(inFlight))
          throw new ExpectedFailure(
            "A docs pull request for this project is already being opened.",
          );
        state.proposals.push({
          id: p.id,
          projectId: p.projectId,
          requestedBy: p.requestedBy,
          enable: p.enable,
          githubRepoId: p.githubRepoId,
          ownerId: p.ownerId,
          slug: p.slug,
          prNumber: null,
          prUrl: null,
          state: "opening",
          createdAt: new Date(),
          baseSha: p.baseSha,
          lastError: null,
        });
      }
      if (p.enable && state.project?.docsRepoId === null)
        state.project.docsRepoId = p.githubRepoId;
    },
    markOpen: async (id, pull) => {
      const row = state.proposals.find((r) => r.id === id && inFlight(r));
      if (row)
        Object.assign(row, {
          state: "open",
          prNumber: pull.number,
          prUrl: pull.url,
        });
    },
    noteError: async (id, message) => {
      const row = state.proposals.find((r) => r.id === id);
      if (row) row.lastError = message;
    },
    markFailed: async (id, message) => {
      const row = state.proposals.find((r) => r.id === id && inFlight(r));
      if (row) Object.assign(row, { state: "failed", lastError: message });
    },
    setRequested: async (_id, requested, githubRepoId) => {
      state.project!.docsRequested = requested;
      if (requested && state.project!.docsRepoId === null)
        state.project!.docsRepoId = githubRepoId;
    },
    inFlight: async () => state.proposals.filter(inFlight),
    settleMerged: async (proposal) => {
      const row = state.proposals.find(
        (r) => r.id === proposal.id && inFlight(r),
      );
      if (!row) return;
      row.state = "merged";
      state.project!.docsRequested = proposal.enable;
    },
    settleClosed: async (proposal) => {
      const row = state.proposals.find(
        (r) => r.id === proposal.id && inFlight(r),
      );
      if (row) row.state = "closed";
    },
    markPublished: async (slug) => {
      state.published.push(slug);
      return true;
    },
    audit: async (entry) => {
      state.audits.push(entry);
    },
  };
  return { store, state };
}

type Outcome = (
  input: TrustedPrInput<MapDetail> & { resumable: true },
  number: number,
) =>
  | TrustedPrResult<MapDetail>
  | { status: "recovered"; url: string; number: number; branch: string }
  | "throw";

/** The PR transport, scripted: it runs `prepare` and `beforeWrite` the way the real one does, over a fixed map. */
function transport(text: string, outcome?: Outcome) {
  const written: { path: string; content: string }[][] = [];
  const inputs: (TrustedPrInput<MapDetail> & { resumable: true })[] = [];
  let opened = 0;
  const propose: DocsDeps["propose"] = async (input) => {
    inputs.push(input);
    const scripted = outcome?.(input, opened + 1);
    if (scripted && scripted !== "throw" && scripted.status === "recovered")
      return scripted;
    const base = { branch: "main", sha: SHA, read: async () => text };
    const draft = await input.prepare(base);
    if (draft.status !== "ready") return draft;
    await input.beforeWrite?.(base, draft);
    if (scripted === "throw") throw new Error("the worker died");
    if (scripted) return scripted;
    written.push(draft.files);
    opened += 1;
    return {
      status: "opened",
      url: `https://github.com/DevDogsUGA/DevDogsUGA/pull/${100 + opened}`,
      number: 100 + opened,
      branch: input.branch,
      draft: input.staging,
      files: draft.files.map((f) => f.path),
      baseSha: SHA,
      detail: draft.detail,
    };
  };
  return { propose, written, inputs };
}

function deps(
  store: DocsStore,
  propose: DocsDeps["propose"],
  over: Partial<DocsDeps> = {},
): DocsDeps & { consume: ReturnType<typeof vi.fn> } {
  let ids = 0;
  const consume = vi.fn(async () => true);
  return {
    store,
    propose,
    officerIdentity: async () => ({
      name: "Test Officer",
      email: "1+tester@users.noreply.github.com",
    }),
    consumeRateLimit: consume,
    credentials: () => ({ appId: "9", privateKey: "key" }),
    repo: { owner: "DevDogsUGA", name: "DevDogsUGA" },
    staging: () => false,
    bundledSlugs: () => [
      "platform",
      "toolkit",
      "workshops",
      "schedule-builder",
      "operations",
    ],
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    ...over,
    consume,
  };
}

const run = (d: DocsDeps, change: DocsChange, caller = OFFICER) =>
  proposeDocsChange(d, caller, PROJECT, change);

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

describe("proposeDocsChange: who and what", () => {
  it("refuses a member before reading anything", async () => {
    const { store } = memoryStore({});
    const load = vi.spyOn(store, "loadProject");
    const t = transport(mapText());
    const error = await refusal(run(deps(store, t.propose), "enable", MEMBER));
    expect(error).toBeInstanceOf(ExpectedFailure);
    expect((error as Error).message).toMatch(/Only officers/);
    expect(load).not.toHaveBeenCalled();
    expect(t.inputs).toEqual([]);
  });

  it("refuses an unknown project, a project with no slug, and a slug the site's own docs hold", async () => {
    const t = transport(mapText());
    expect(
      (
        (await refusal(
          run(deps(memoryStore({ project: null }).store, t.propose), "enable"),
        )) as Error
      ).message,
    ).toMatch(/not found/);
    expect(
      (
        (await refusal(
          run(
            deps(memoryStore({ project: { slug: null } }).store, t.propose),
            "enable",
          ),
        )) as Error
      ).message,
    ).toMatch(/no slug/);
    for (const slug of ["platform", "toolkit", "schedule-builder", "_shared"]) {
      const error = await refusal(
        run(
          deps(memoryStore({ project: { slug } }).store, t.propose),
          "enable",
        ),
      );
      expect((error as Error).message, slug).toMatch(/bundled with the site/);
    }
    expect(t.inputs).toEqual([]);
  });

  it("refuses a slug the bundled docs hold even when the map would allow it", async () => {
    const { store } = memoryStore({ project: { slug: "extras" } });
    const t = transport(mapText());
    const error = await refusal(
      run(deps(store, t.propose, { bundledSlugs: () => ["extras"] }), "enable"),
    );
    expect((error as Error).message).toMatch(/bundled with the site/);
  });
});

describe("proposeDocsChange: turning docs on", () => {
  it("refuses without an approved, available repository, or with the choice unmade", async () => {
    const t = transport(mapText());
    const cases: [Parameters<typeof memoryStore>[0], RegExp][] = [
      [{ repos: [] }, /no repository/],
      [{ repos: [{ ...REPO, approved: false }] }, /isn't approved/],
      [{ repos: [{ ...REPO, available: false }] }, /unavailable/],
      [
        { repos: [REPO, { ...REPO, githubRepoId: "9002" }] },
        /several repositories/,
      ],
      [{ project: { docsRepoId: "9003" }, repos: [REPO] }, /no repository/],
    ];
    for (const [initial, pattern] of cases) {
      const { store } = memoryStore(initial);
      const error = await refusal(run(deps(store, t.propose), "enable"));
      expect((error as Error).message).toMatch(pattern);
    }
    expect(t.inputs).toEqual([]);
  });

  it("uses the project's docs repository when it has several", async () => {
    const other = {
      ...REPO,
      githubRepoId: "9002",
      ownerId: "43",
      owner: "someone",
    };
    const { store } = memoryStore({
      project: { docsRepoId: "9002" },
      repos: [REPO, other],
    });
    const t = transport(mapText());
    await run(deps(store, t.propose), "enable");
    const written = parseProjectMap(t.written[0]![0]!.content);
    expect(written.ok && written.map.projects.example).toEqual({
      githubRepoId: "9002",
      ownerId: "43",
      ownerLogin: "someone",
    });
  });

  it("refuses while docs are paused, and says docs already on are on", async () => {
    const t = transport(mapText());
    const paused = memoryStore({
      project: { docsPausedAt: new Date(), docsRequested: true },
    });
    expect(
      ((await refusal(run(deps(paused.store, t.propose), "enable"))) as Error)
        .message,
    ).toMatch(/Confirm the new owner/);
    const on = memoryStore({ project: { docsRequested: true } });
    expect(await run(deps(on.store, t.propose), "enable")).toEqual({
      kind: "unchanged",
      message: "Docs are already turned on.",
    });
    expect(t.inputs).toEqual([]);
  });

  it("refuses without the writer App's credentials, and over the hourly limit, spending nothing on a refusal", async () => {
    const { store } = memoryStore({});
    const t = transport(mapText());
    const noCredentials = deps(store, t.propose, { credentials: () => null });
    expect(
      ((await refusal(run(noCredentials, "enable"))) as Error).message,
    ).toMatch(/isn't set up/);
    expect(noCredentials.consume).not.toHaveBeenCalled();

    const limited = deps(store, t.propose);
    limited.consume.mockResolvedValue(false);
    expect(((await refusal(run(limited, "enable"))) as Error).message).toMatch(
      /lot of pull requests/,
    );
    expect(t.inputs).toEqual([]);

    // A refusal for the project's own state never spends the officer's hour.
    const unapproved = memoryStore({ repos: [{ ...REPO, approved: false }] });
    const fresh = deps(unapproved.store, t.propose);
    await refusal(run(fresh, "enable"));
    expect(fresh.consume).not.toHaveBeenCalled();
  });

  it("opens one pull request that only adds the entry, records it, and returns its address", async () => {
    const { store, state } = memoryStore({});
    const t = transport(mapText());
    const d = deps(store, t.propose);
    const outcome = await run(d, "enable");

    expect(outcome).toEqual({
      kind: "pending",
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/101",
      number: 101,
      recovered: false,
    });
    expect(d.consume).toHaveBeenCalledWith("officer-1");

    // The transport is told the repository, the branch and that this may resume.
    const input = t.inputs[0]!;
    expect(input.repo).toEqual({ owner: "DevDogsUGA", name: "DevDogsUGA" });
    expect(input.resumable).toBe(true);
    expect(input.staging).toBe(false);
    expect(input.branch).toBe(
      proposalBranch("00000000-0000-4000-8000-000000000001"),
    );

    // What it writes is the map plus this one entry, valid for the workflow.
    expect(t.written).toHaveLength(1);
    expect(t.written[0]).toHaveLength(1);
    expect(t.written[0]![0]!.path).toBe(".github/docs-projects.json");
    const parsed = parseProjectMap(t.written[0]![0]!.content);
    expect(parsed).toEqual({
      ok: true,
      map: { comment: "notes", projects: { example: ENTRY } },
    });

    // The row went opening -> open, with the base commit and the pull request.
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]).toMatchObject({
      state: "open",
      enable: true,
      slug: "example",
      githubRepoId: "9001",
      ownerId: "42",
      baseSha: SHA,
      prNumber: 101,
      requestedBy: "officer-1",
    });
    // The pause is keyed by the docs repository, so it is recorded.
    expect(state.project!.docsRepoId).toBe("9001");
    // It never claims docs are live.
    expect(state.project!.docsRequested).toBe(false);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      change: "enable",
      slug: "example",
      number: 101,
    });
  });

  it("names the officer as co-author and tells reviewers it only changes the map", async () => {
    const { store } = memoryStore({});
    const t = transport(mapText());
    let draft: Awaited<ReturnType<(typeof t.inputs)[0]["prepare"]>> | undefined;
    const spy: DocsDeps["propose"] = async (input) => {
      const wrapped = {
        ...input,
        prepare: async (base: Parameters<typeof input.prepare>[0]) =>
          (draft = await input.prepare(base)),
      };
      return t.propose(wrapped);
    };
    await run(deps(store, spy, { staging: () => true }), "enable");
    expect(draft).toMatchObject({ status: "ready" });
    if (draft?.status !== "ready") return;
    expect(draft.title).toBe("Docs: add example to the project docs");
    expect(draft.commitMessage).toContain(
      "Co-authored-by: Test Officer <1+tester@users.noreply.github.com>",
    );
    expect(draft.body).toContain("Staging proposal");
    expect(draft.body).toContain("only `.github/docs-projects.json`");
    expect(draft.body).toContain("`docs-publishing`");
  });

  it("refuses when the map would not validate (the repository already publishes as another slug)", async () => {
    const { store, state } = memoryStore({});
    const t = transport(mapText({ other: ENTRY }));
    const error = await refusal(run(deps(store, t.propose), "enable"));
    expect((error as Error).message).toMatch(/is already used by/);
    expect(state.proposals).toEqual([]);
  });

  it("opens nothing when the map already lists the project, and brings the flag into line", async () => {
    const { store, state } = memoryStore({});
    const t = transport(mapText({ example: ENTRY }));
    expect(await run(deps(store, t.propose), "enable")).toEqual({
      kind: "unchanged",
      message: "The map already lists this project's docs.",
    });
    expect(state.project!.docsRequested).toBe(true);
    // The repository the map names is recorded as the docs repository, so the
    // owner-change pause can find the project.
    expect(state.project!.docsRepoId).toBe("9001");
    expect(state.proposals).toEqual([]);
    expect(t.written).toEqual([]);
  });
});

describe("proposeDocsChange: idempotency", () => {
  it("answers the same request again with the same pull request, opening no second", async () => {
    const { store, state } = memoryStore({});
    const t = transport(mapText());
    const d = deps(store, t.propose);
    const first = await run(d, "enable");
    const again = await run(d, "enable");
    expect(again).toMatchObject({
      kind: "pending",
      url: (first as { url: string }).url,
      recovered: true,
    });
    expect(t.inputs).toHaveLength(1);
    expect(state.proposals).toHaveLength(1);
  });

  it("refuses the opposite request while one is open, naming the pull request", async () => {
    const { store, state } = memoryStore({});
    const t = transport(mapText());
    const d = deps(store, t.propose);
    await run(d, "enable");
    state.project!.docsRequested = true;
    const error = await refusal(run(d, "disable"));
    expect((error as Error).message).toMatch(
      /already open for this project \(#101\)/,
    );
    expect(t.inputs).toHaveLength(1);
  });

  it("resumes an attempt that died after writing its row, under the same id, and finds the pull request", async () => {
    const { store, state } = memoryStore({});
    const first = transport(mapText(), () => "throw");
    const d = deps(store, first.propose);
    await expect(run(d, "enable")).rejects.toThrow("the worker died");
    // The row is there, opening, with the branch's id.
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]).toMatchObject({ state: "opening" });
    const id = state.proposals[0]!.id;

    // The pull request had been opened before the worker died.
    const second = transport(mapText(), (input) => ({
      status: "recovered",
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/55",
      number: 55,
      branch: input.branch,
    }));
    const outcome = await run(deps(store, second.propose), "enable");
    expect(second.inputs[0]!.branch).toBe(proposalBranch(id));
    expect(outcome).toEqual({
      kind: "pending",
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/55",
      number: 55,
      recovered: true,
    });
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]).toMatchObject({ state: "open", prNumber: 55 });
    // A recovered pull request is not audited a second time.
    expect(state.audits).toEqual([]);
  });

  it("keeps the row opening when GitHub refuses, notes why, and a retry resumes it", async () => {
    const { store, state } = memoryStore({});
    const refused = transport(mapText(), () => ({
      status: "github_error",
      message: "GitHub answered 502 for POST /pulls.",
    }));
    const error = await refusal(run(deps(store, refused.propose), "enable"));
    expect((error as Error).message).toMatch(
      /didn't accept the pull request: GitHub answered 502/,
    );
    expect(state.proposals[0]).toMatchObject({
      state: "opening",
      lastError: "GitHub answered 502 for POST /pulls.",
    });
    const id = state.proposals[0]!.id;

    const retry = transport(mapText());
    const outcome = await run(deps(store, retry.propose), "enable");
    expect(outcome).toMatchObject({ kind: "pending" });
    expect(retry.inputs[0]!.branch).toBe(proposalBranch(id));
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]!.state).toBe("open");
  });

  it("does not write a row when GitHub fails before anything is prepared", async () => {
    const { store, state } = memoryStore({});
    const propose: DocsDeps["propose"] = async () => ({
      status: "github_error",
      message: "no installation",
    });
    await refusal(run(deps(store, propose), "enable"));
    expect(state.proposals).toEqual([]);
  });

  it("lets only one of two concurrent requests open a proposal", async () => {
    const { store, state } = memoryStore({});
    const t = transport(mapText());
    const d = deps(store, t.propose);
    const results = await Promise.allSettled([
      run(d, "enable"),
      run(d, "enable"),
    ]);
    const opened = results.filter(
      (r) =>
        r.status === "fulfilled" &&
        r.value.kind === "pending" &&
        !r.value.recovered,
    );
    expect(opened).toHaveLength(1);
    expect(state.proposals).toHaveLength(1);
  });
});

describe("proposeDocsChange: turning docs off and confirming an owner", () => {
  it("removes the entry, and does nothing when docs are off or the map has no entry", async () => {
    const on = memoryStore({
      project: { docsRequested: true, docsRepoId: "9001" },
    });
    const t = transport(mapText({ example: ENTRY }));
    await run(deps(on.store, t.propose), "disable");
    const parsed = parseProjectMap(t.written[0]![0]!.content);
    expect(parsed).toEqual({
      ok: true,
      map: { comment: "notes", projects: {} },
    });
    expect(on.state.proposals[0]).toMatchObject({
      enable: false,
      state: "open",
    });
    // Turning off never records a repository choice.
    expect(on.state.project!.docsRepoId).toBe("9001");

    const off = memoryStore({});
    expect(await run(deps(off.store, t.propose), "disable")).toEqual({
      kind: "unchanged",
      message: "Docs are already turned off.",
    });

    const stale = memoryStore({
      project: { docsRequested: true, docsRepoId: "9001" },
    });
    const empty = transport(mapText());
    expect(
      await run(deps(stale.store, empty.propose), "disable"),
    ).toMatchObject({ kind: "unchanged" });
    expect(stale.state.project!.docsRequested).toBe(false);
  });

  it("disables even when the repository is unavailable or unapproved", async () => {
    const { store } = memoryStore({
      project: { docsRequested: true, docsRepoId: "9001" },
      repos: [{ ...REPO, available: false, approved: false }],
    });
    const t = transport(mapText({ example: ENTRY }));
    expect(await run(deps(store, t.propose), "disable")).toMatchObject({
      kind: "pending",
    });
  });

  it("confirms a transferred repository's new owner by updating the entry", async () => {
    const moved = { ...REPO, ownerId: "77", owner: "Newcomer" };
    const { store, state } = memoryStore({
      project: {
        docsRequested: true,
        docsRepoId: "9001",
        docsPausedAt: new Date(),
      },
      repos: [moved],
    });
    const t = transport(mapText({ example: ENTRY }));
    const outcome = await run(deps(store, t.propose), "confirm");
    expect(outcome).toMatchObject({ kind: "pending" });
    const parsed = parseProjectMap(t.written[0]![0]!.content);
    expect(parsed.ok && parsed.map.projects.example).toEqual({
      githubRepoId: "9001",
      ownerId: "77",
      ownerLogin: "Newcomer",
    });
    expect(state.proposals[0]).toMatchObject({ enable: true, ownerId: "77" });
    expect(state.audits[0]).toMatchObject({ change: "confirm" });
  });

  it("refuses to confirm when docs aren't on, aren't paused, or the map names another repository", async () => {
    const t = transport(mapText({ example: ENTRY }));
    const notOn = memoryStore({ project: { docsPausedAt: new Date() } });
    expect(
      ((await refusal(run(deps(notOn.store, t.propose), "confirm"))) as Error)
        .message,
    ).toMatch(/aren't turned on/);
    const notPaused = memoryStore({ project: { docsRequested: true } });
    expect(
      (
        (await refusal(
          run(deps(notPaused.store, t.propose), "confirm"),
        )) as Error
      ).message,
    ).toMatch(/aren't paused/);

    const other = memoryStore({
      project: {
        docsRequested: true,
        docsRepoId: "9009",
        docsPausedAt: new Date(),
      },
      repos: [{ ...REPO, githubRepoId: "9009" }],
    });
    expect(
      ((await refusal(run(deps(other.store, t.propose), "confirm"))) as Error)
        .message,
    ).toMatch(/different repository/);

    const missing = memoryStore({
      project: { docsRequested: true, docsPausedAt: new Date() },
    });
    const noEntry = transport(mapText());
    expect(
      (
        (await refusal(
          run(deps(missing.store, noEntry.propose), "confirm"),
        )) as Error
      ).message,
    ).toMatch(/isn't in the map yet/);
  });

  it("says so when the map already has the new owner", async () => {
    const { store } = memoryStore({
      project: { docsRequested: true, docsPausedAt: new Date() },
    });
    const t = transport(mapText({ example: ENTRY }));
    expect(await run(deps(store, t.propose), "confirm")).toEqual({
      kind: "unchanged",
      message: "The map already has this owner.",
    });
  });
});

describe("reconcileDocsProposals", () => {
  const NOW = Date.parse("2026-11-01T12:00:00Z");
  type Row = ProposalRow & { baseSha: string; lastError: string | null };

  async function setup(
    pull: PullState | ((number: number) => PullState),
    options: {
      enable?: boolean;
      found?: { number: number; url: string; state: PullState } | null;
      ageMs?: number;
    } = {},
  ) {
    const { store, state } = memoryStore({});
    const t = transport(mapText());
    await run(deps(store, t.propose), "enable");
    const row = state.proposals[0] as Row;
    row.enable = options.enable ?? true;
    row.createdAt = new Date(NOW - (options.ageMs ?? 0));
    const pullState = vi.fn(async (n: number) =>
      typeof pull === "function" ? pull(n) : pull,
    );
    const pullForBranch = vi.fn(async () => options.found ?? null);
    return { store, state, row, pullState, pullForBranch, now: () => NOW };
  }

  it("applies a merged pull request: docs are requested only now", async () => {
    const s = await setup({ kind: "merged" });
    expect(s.state.project!.docsRequested).toBe(false);
    const result = await reconcileDocsProposals(s);
    expect(result).toEqual({ checked: 1, merged: 1, closed: 0, failed: 0 });
    expect(s.row.state).toBe("merged");
    expect(s.state.project!.docsRequested).toBe(true);
    expect(s.pullState).toHaveBeenCalledWith(101);
  });

  it("applies a merged removal", async () => {
    const s = await setup({ kind: "merged" }, { enable: false });
    s.state.project!.docsRequested = true;
    await reconcileDocsProposals(s);
    expect(s.state.project!.docsRequested).toBe(false);
  });

  it("leaves the project as it was when the pull request closes unmerged", async () => {
    const s = await setup({ kind: "closed" });
    const result = await reconcileDocsProposals(s);
    expect(result).toMatchObject({ closed: 1, merged: 0 });
    expect(s.row.state).toBe("closed");
    expect(s.state.project!.docsRequested).toBe(false);
  });

  it("leaves an open pull request, and one GitHub could not be asked about, for the next run", async () => {
    for (const state of [{ kind: "open" }, { kind: "unknown" }] as const) {
      const s = await setup(state);
      const result = await reconcileDocsProposals(s);
      expect(result).toEqual({ checked: 1, merged: 0, closed: 0, failed: 0 });
      expect(s.row.state).toBe("open");
    }
  });

  it("is idempotent: a settled proposal is no longer in flight", async () => {
    const s = await setup({ kind: "merged" });
    await reconcileDocsProposals(s);
    const second = await reconcileDocsProposals(s);
    expect(second).toEqual({ checked: 0, merged: 0, closed: 0, failed: 0 });
    expect(s.pullState).toHaveBeenCalledTimes(1);
  });

  it("finds the pull request of an opening proposal by its branch, then follows it", async () => {
    const s = await setup({ kind: "open" });
    Object.assign(s.row, { state: "opening", prNumber: null, prUrl: null });
    s.pullForBranch.mockResolvedValue({
      number: 7,
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/7",
      state: { kind: "merged" },
    });
    const result = await reconcileDocsProposals(s);
    expect(s.pullForBranch).toHaveBeenCalledWith(proposalBranch(s.row.id));
    expect(result.merged).toBe(1);
    expect(s.row).toMatchObject({ state: "merged", prNumber: 7 });
  });

  it("gives up on an opening proposal whose pull request never appeared, after an hour", async () => {
    const fresh = await setup({ kind: "open" }, { ageMs: 10 * 60_000 });
    Object.assign(fresh.row, { state: "opening", prNumber: null, prUrl: null });
    expect(await reconcileDocsProposals(fresh)).toMatchObject({ failed: 0 });
    expect(fresh.row.state).toBe("opening");

    const old = await setup({ kind: "open" }, { ageMs: 2 * 3_600_000 });
    Object.assign(old.row, { state: "opening", prNumber: null, prUrl: null });
    expect(await reconcileDocsProposals(old)).toMatchObject({ failed: 1 });
    expect(old.row).toMatchObject({
      state: "failed",
      lastError: "The pull request was never opened",
    });
    // The project's slug and toggle are free again.
    expect(await old.store.activeProposal(PROJECT)).toBeNull();
  });
});

describe("recordPublications", () => {
  it("records each pointer's own publication time, and skips an unreadable one", async () => {
    const { store, state } = memoryStore({});
    const markPublished = vi.spyOn(store, "markPublished");
    const count = await recordPublications(store, [
      { project: "alpha", publishedAt: "2026-11-01T10:00:00.000Z" },
      { project: "beta", publishedAt: "not a date" },
    ]);
    expect(count).toBe(1);
    expect(markPublished).toHaveBeenCalledTimes(1);
    expect(markPublished).toHaveBeenCalledWith(
      "alpha",
      new Date("2026-11-01T10:00:00.000Z"),
    );
    expect(state.published).toEqual(["alpha"]);
  });

  it("counts only the projects it newly recorded", async () => {
    const { store } = memoryStore({});
    vi.spyOn(store, "markPublished").mockResolvedValueOnce(false);
    expect(
      await recordPublications(store, [
        { project: "alpha", publishedAt: "2026-11-01T10:00:00Z" },
      ]),
    ).toBe(0);
  });
});

beforeEach(() => vi.clearAllMocks());
