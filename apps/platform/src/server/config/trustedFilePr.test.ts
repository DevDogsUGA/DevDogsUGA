import { describe, expect, it, vi } from "vitest";
import { fakeGithub, TEST_PRIVATE_KEY_PKCS1 } from "./githubFake";
import {
  proposeTrustedFilePr,
  type TrustedBase,
  type TrustedDraft,
  type TrustedPrInput,
  type TrustedRefusal,
} from "./trustedFilePr";

const FILE = ".github/docs-projects.json";

const draft = (content = "next\n"): TrustedDraft<{ note: string }> => ({
  status: "ready",
  files: [{ path: FILE, content }],
  commitMessage: "chore: a change\n\nCo-authored-by: A <a@b.c>",
  title: "Docs: a change",
  body: "Body",
  detail: { note: "kept" },
});

function input(
  github: ReturnType<typeof fakeGithub>,
  overrides: Partial<TrustedPrInput<{ note: string }>> = {},
): TrustedPrInput<{ note: string }> {
  return {
    credentials: { appId: "9", privateKey: TEST_PRIVATE_KEY_PKCS1 },
    repo: { owner: "DevDogsUGA", name: "DevDogsUGA" },
    staging: false,
    branch: "docs-map/abc",
    fetch: github.fetch,
    now: () => 1_700_000_000_000,
    prepare: async () => draft(),
    ...overrides,
  };
}

const writePaths = (github: ReturnType<typeof fakeGithub>) =>
  github.writes().map((w) => `${w.method} ${w.path}`);

describe("proposeTrustedFilePr", () => {
  it("writes a tree, a commit, the branch and the pull request, in that order, from the base it read", async () => {
    const github = fakeGithub();
    const result = await proposeTrustedFilePr(input(github));

    expect(result).toEqual({
      status: "opened",
      url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/42",
      number: 42,
      branch: "docs-map/abc",
      draft: false,
      files: [FILE],
      baseSha: "basesha",
      detail: { note: "kept" },
    });
    expect(writePaths(github)).toEqual([
      "POST /repos/DevDogsUGA/DevDogsUGA/git/trees",
      "POST /repos/DevDogsUGA/DevDogsUGA/git/commits",
      "POST /repos/DevDogsUGA/DevDogsUGA/git/refs",
      "POST /repos/DevDogsUGA/DevDogsUGA/pulls",
    ]);
    const [tree, commit, ref, pull] = github.writes().map((w) => w.body) as [
      { base_tree: string; tree: { path: string; content: string }[] },
      { parents: string[]; message: string; tree: string },
      { ref: string; sha: string },
      { head: string; base: string; title: string; draft: boolean },
    ];
    expect(tree.base_tree).toBe("basetree");
    expect(tree.tree).toEqual([
      { path: FILE, mode: "100644", type: "blob", content: "next\n" },
    ]);
    expect(commit.parents).toEqual(["basesha"]);
    expect(commit.message).toContain("Co-authored-by");
    expect(ref).toEqual({ ref: "refs/heads/docs-map/abc", sha: "newcommit" });
    expect(pull).toMatchObject({
      head: "docs-map/abc",
      base: "main",
      title: "Docs: a change",
      draft: false,
    });
  });

  it("hands prepare the base branch's commit and a reader of its files", async () => {
    const github = fakeGithub({ files: { [FILE]: "{}\n" } });
    let seen: { branch: string; sha: string; text: string } | undefined;
    await proposeTrustedFilePr(
      input(github, {
        prepare: async (base: TrustedBase) => {
          seen = {
            branch: base.branch,
            sha: base.sha,
            text: await base.read(FILE),
          };
          return { status: "nothing_to_propose" };
        },
      }),
    );
    expect(seen).toEqual({ branch: "main", sha: "basesha", text: "{}\n" });
    expect(
      github.calls.some(
        (c) =>
          c.path ===
          `/repos/DevDogsUGA/DevDogsUGA/contents/${FILE}?ref=basesha`,
      ),
    ).toBe(true);
  });

  it("writes nothing when prepare refuses, and passes the refusal back", async () => {
    const refusals: TrustedRefusal[] = [
      { status: "invalid", errors: ["bad"] },
      { status: "nothing_to_propose" },
      { status: "github_error", message: "broken" },
    ];
    for (const refusal of refusals) {
      const github = fakeGithub();
      const beforeWrite = vi.fn();
      const result = await proposeTrustedFilePr(
        input(github, { prepare: async () => refusal, beforeWrite }),
      );
      expect(result).toEqual(refusal);
      expect(github.writes()).toEqual([]);
      expect(beforeWrite).not.toHaveBeenCalled();
    }
  });

  it("treats a draft with no files as nothing to propose", async () => {
    const github = fakeGithub();
    const result = await proposeTrustedFilePr(
      input(github, { prepare: async () => ({ ...draft(), files: [] }) }),
    );
    expect(result).toEqual({ status: "nothing_to_propose" });
    expect(github.writes()).toEqual([]);
  });

  it("runs beforeWrite after prepare and before the first write, and a failure there writes nothing", async () => {
    const github = fakeGithub();
    const order: string[] = [];
    await proposeTrustedFilePr(
      input(github, {
        prepare: async () => (order.push("prepare"), draft()),
        beforeWrite: async (base) => {
          order.push(`before:${base.sha}:${github.writes().length}`);
        },
      }),
    );
    expect(order).toEqual(["prepare", "before:basesha:0"]);

    const failing = fakeGithub();
    await expect(
      proposeTrustedFilePr(
        input(failing, {
          beforeWrite: async () => {
            throw new Error("database down");
          },
        }),
      ),
    ).rejects.toThrow("database down");
    expect(failing.writes()).toEqual([]);
  });

  it("opens a draft labelled staging on a staging environment", async () => {
    const github = fakeGithub();
    const result = await proposeTrustedFilePr(input(github, { staging: true }));
    expect(result).toMatchObject({ status: "opened", draft: true });
    const pull = github.writes().find((w) => w.path.endsWith("/pulls"));
    expect(pull?.body).toMatchObject({
      draft: true,
      title: "[staging] Docs: a change",
    });
    expect(writePaths(github)).toContain(
      "POST /repos/DevDogsUGA/DevDogsUGA/issues/42/labels",
    );
  });

  it("reports a GitHub failure as a result, leaving no pull request", async () => {
    const github = fakeGithub({
      failOn: "POST /repos/DevDogsUGA/DevDogsUGA/git/refs",
    });
    const result = await proposeTrustedFilePr(input(github));
    expect(result.status).toBe("github_error");
    expect(github.writes().some((w) => w.path.endsWith("/pulls"))).toBe(false);
  });

  describe("resumable", () => {
    it("answers with the pull request already open from the branch, writing and preparing nothing", async () => {
      const github = fakeGithub({
        pulls: [{ html_url: "https://github.com/x/y/pull/7", number: 7 }],
      });
      const prepare = vi.fn();
      const result = await proposeTrustedFilePr(
        input(github, { resumable: true, prepare }),
      );
      expect(result).toEqual({
        status: "recovered",
        url: "https://github.com/x/y/pull/7",
        number: 7,
        branch: "docs-map/abc",
      });
      expect(prepare).not.toHaveBeenCalled();
      expect(github.writes()).toEqual([]);
      expect(
        github.calls.find((c) =>
          c.path.startsWith("/repos/DevDogsUGA/DevDogsUGA/pulls?"),
        ),
      ).toBeDefined();
      expect(
        github.calls.some((c) =>
          c.path.includes("head=DevDogsUGA%3Adocs-map%2Fabc"),
        ),
      ).toBe(true);
    });

    it("opens the pull request from a branch that exists without one, without writing the commit again", async () => {
      const github = fakeGithub({ branches: ["docs-map/abc"] });
      const result = await proposeTrustedFilePr(
        input(github, { resumable: true }),
      );
      expect(result).toMatchObject({ status: "opened", number: 42 });
      expect(writePaths(github)).toEqual([
        "POST /repos/DevDogsUGA/DevDogsUGA/pulls",
      ]);
    });

    it("does the whole job when there is neither a pull request nor a branch", async () => {
      const github = fakeGithub();
      const result = await proposeTrustedFilePr(
        input(github, { resumable: true }),
      );
      expect(result).toMatchObject({ status: "opened" });
      expect(writePaths(github)).toHaveLength(4);
    });

    it("does not look for a pull request unless asked to resume", async () => {
      const github = fakeGithub();
      await proposeTrustedFilePr(input(github));
      expect(github.calls.some((c) => c.path.includes("/pulls?"))).toBe(false);
    });
  });
});
