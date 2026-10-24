import { describe, expect, it } from "vitest";
import type { SavedEdit } from "./edits";
import {
  commitMessage,
  inlineCode,
  openProposal,
  plainName,
  pullRequestBody,
  summarize,
} from "./githubProposal";
import {
  committedTexts,
  fakeGithub,
  TEST_PRIVATE_KEY_PKCS1,
} from "./githubFake";

interface Body {
  base_tree: string;
  tree: { path: string; content: string }[];
  parents: string[];
  message: string;
  ref: string;
  sha: string;
  head: string;
  base: string;
  draft: boolean;
  title: string;
  body: string;
}

interface Meetings {
  meetings: { slug: string; room?: string }[];
}

const officer = {
  name: "Test Officer",
  email: "123+tester@users.noreply.github.com",
};

const roomEdit: SavedEdit = {
  collection: "meeting",
  key: "2026-09-14",
  isNew: false,
  fields: { room: "200" },
};

function run(
  github: ReturnType<typeof fakeGithub>,
  edits: SavedEdit[],
  staging = false,
) {
  return openProposal({
    credentials: { appId: "9", privateKey: TEST_PRIVATE_KEY_PKCS1 },
    repo: { owner: "DevDogsUGA", name: "DevDogsUGA" },
    edits,
    officer,
    staging,
    fetch: github.fetch,
    now: () => 1_700_000_000_000,
    nonce: () => "abcdef123456",
  });
}

describe("openProposal", () => {
  it("opens a pull request from the app's own branch with the officer as co-author", async () => {
    const github = fakeGithub();
    const result = await run(github, [roomEdit]);
    expect(result).toMatchObject({
      status: "opened",
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/42",
      number: 42,
      branch: "config/proposal-1700000000-abcdef12",
      draft: false,
      files: ["packages/events/src/data/meetings.json"],
    });

    const writes = github.writes();
    expect(
      writes.map(
        (w) =>
          `${w.method} ${w.path.replace("/repos/DevDogsUGA/DevDogsUGA", "")}`,
      ),
    ).toEqual([
      "POST /git/trees",
      "POST /git/commits",
      "POST /git/refs",
      "POST /pulls",
    ]);
    const [tree, commit, ref, pull] = writes.map((w) => w.body) as [
      Body,
      Body,
      Body,
      Body,
    ];
    expect(tree.base_tree).toBe("basetree");
    expect(tree.tree).toHaveLength(1);
    expect(tree.tree[0]!.path).toBe("packages/events/src/data/meetings.json");
    const written = JSON.parse(tree.tree[0]!.content) as Meetings;
    expect(written.meetings.find((m) => m.slug === "2026-09-14")?.room).toBe(
      "200",
    );
    expect(commit.parents).toEqual(["basesha"]);
    expect(commit.message).toContain(
      "Co-authored-by: Test Officer <123+tester@users.noreply.github.com>",
    );
    expect(ref).toEqual({
      ref: "refs/heads/config/proposal-1700000000-abcdef12",
      sha: "newcommit",
    });
    expect(pull).toMatchObject({
      head: "config/proposal-1700000000-abcdef12",
      base: "main",
      draft: false,
    });
    expect(pull.body).toContain("Proposed by Test Officer");
    expect(pull.body).toContain("Room: `124` -> `200`");
    expect(pull.title).toBe("Config: update 1 meeting");
  });

  it("writes only the files that changed, byte-formatted like the repository", async () => {
    const github = fakeGithub();
    await run(github, [
      roomEdit,
      {
        collection: "venue",
        key: "dlw",
        isNew: false,
        fields: { locality: "Athens" },
      },
    ]);
    const tree = github.writes()[0]!.body as {
      tree: { path: string; content: string }[];
    };
    expect(tree.tree.map((f) => f.path).sort()).toEqual([
      "packages/events/src/data/meetings.json",
      "packages/events/src/data/venues.json",
    ]);
    // Everything not edited is untouched: the diff is exactly one added line.
    const venues = tree.tree.find((f) =>
      f.path.endsWith("venues.json"),
    )!.content;
    expect(venues.split("\n").length).toBe(
      committedTexts().venues.split("\n").length + 1,
    );
  });

  it("opens a draft labelled staging on a staging environment", async () => {
    const github = fakeGithub();
    const result = await run(github, [roomEdit], true);
    expect(result).toMatchObject({ status: "opened", draft: true });
    const pull = github.writes().find((w) => w.path.endsWith("/pulls"))!
      .body as Body;
    expect(pull.draft).toBe(true);
    expect(pull.title).toMatch(/^\[staging\] /);
    expect(
      github.calls.some(
        (c) =>
          c.path.endsWith("/issues/42/labels") &&
          JSON.stringify(c.body) === '{"labels":["staging"]}',
      ),
    ).toBe(true);
  });

  it("opens nothing when the proposal fails validation", async () => {
    const github = fakeGithub();
    const result = await run(github, [
      { ...roomEdit, fields: { venue: "nowhere" } },
    ]);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.join(" ")).toContain("nowhere");
    }
    expect(github.writes()).toEqual([]);
  });

  it("opens nothing when an edit would break the shape", async () => {
    const github = fakeGithub();
    const result = await run(github, [
      { ...roomEdit, fields: { startsAt: "tomorrow-ish" } },
    ]);
    expect(result.status).toBe("invalid");
    expect(github.writes()).toEqual([]);
  });

  it("validates against the base branch, not the deployed copy", async () => {
    // The base branch lost the venue the edit names: nothing may be written.
    const github = fakeGithub({
      texts: { venues: '{\n  "venues": []\n}\n' },
    });
    const result = await run(github, [roomEdit]);
    expect(result.status).toBe("invalid");
    expect(github.writes()).toEqual([]);
  });

  it("opens nothing when there is nothing to propose", async () => {
    const github = fakeGithub();
    expect(await run(github, [])).toEqual({ status: "nothing_to_propose" });
    expect(github.writes()).toEqual([]);
  });

  it("sets aside an edit to an item the base branch no longer has and says so", async () => {
    const github = fakeGithub();
    const gone: SavedEdit = {
      collection: "venue",
      key: "gone",
      isNew: false,
      fields: { name: "x" },
    };
    const result = await run(github, [roomEdit, gone]);
    expect(result).toMatchObject({ status: "opened", skipped: [gone] });
  });

  it("reports a GitHub failure and leaves no pull request", async () => {
    const github = fakeGithub({
      failOn: "POST /repos/DevDogsUGA/DevDogsUGA/git/refs",
    });
    const result = await run(github, [roomEdit]);
    expect(result).toMatchObject({ status: "github_error" });
    expect(github.calls.some((c) => c.path.endsWith("/pulls"))).toBe(false);
  });

  it("reports a missing installation without writing", async () => {
    const github = fakeGithub({
      failOn: "GET /repos/DevDogsUGA/DevDogsUGA/installation",
    });
    expect(await run(github, [roomEdit])).toMatchObject({
      status: "github_error",
    });
    expect(github.writes()).toEqual([]);
  });

  it("keeps a new item's key in the file", async () => {
    const github = fakeGithub();
    const result = await run(github, [
      {
        collection: "workshop",
        key: "rust",
        isNew: true,
        fields: { title: "Rust", description: null, project: null, elHours: 1 },
      },
    ]);
    expect(result).toMatchObject({ status: "opened" });
    const tree = github.writes()[0]!.body as { tree: { content: string }[] };
    const file = JSON.parse(tree.tree[0]!.content) as {
      workshops: { id: string; title: string }[];
    };
    expect(file.workshops.find((w) => w.id === "rust")).toMatchObject({
      title: "Rust",
    });
  });
});

describe("text helpers", () => {
  it("strips angle brackets and line breaks from a name", () => {
    expect(plainName("Test <evil>\nOfficer")).toBe("Test evil Officer");
    expect(plainName("   ")).toBe("A DevDogs officer");
    expect(plainName("@octocat and @org/team `x`")).not.toMatch(/[@`]/);
  });

  it("puts the co-author on its own trailer", () => {
    expect(commitMessage(officer, [])).toMatch(
      /\n\nCo-authored-by: Test Officer <123\+tester@users\.noreply\.github\.com>$/,
    );
  });

  it("flags a staging body as not for merging", () => {
    expect(pullRequestBody(officer, [], true)).toContain("do not merge");
    expect(pullRequestBody(officer, [], false)).not.toContain("do not merge");
  });

  it("summarizes by kind and collection", () => {
    expect(
      summarize([
        { collection: "meeting", key: "a", kind: "changed", fields: [] },
        { collection: "meeting", key: "b", kind: "changed", fields: [] },
        { collection: "workshop", key: "c", kind: "added", fields: [] },
      ]),
    ).toBe("update 2 meetings, add 1 workshop");
  });
});

describe("inlineCode", () => {
  it("fences a value past its longest backtick run, so nothing in it renders live", () => {
    expect(inlineCode("plain @team")).toBe("`plain @team`");
    expect(inlineCode("a ``b`` @team")).toBe("```a ``b`` @team```");
    expect(inlineCode("`edge`")).toBe("`` `edge` ``");
  });
});
