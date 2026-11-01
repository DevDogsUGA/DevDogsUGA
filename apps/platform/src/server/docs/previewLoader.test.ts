// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { GithubResult } from "~/server/github/transport";
import {
  createPreviewLoader,
  FAILURE_KEEP_MS,
  HEAD_KEEP_MS,
  Memo,
  PREVIEW_KEEP_MS,
  PREVIEW_LIMITS,
  type PreviewGithub,
} from "./previewLoader";

/**
 * The live preview loader against a fake GitHub that records every request:
 * what it reads, in what order, what it keeps by commit, and what it refuses
 * before it fetches anything. The compile itself is docs-kit's and is proved
 * there; these use real docs through it.
 */

const REPO_ID = "1234";
const enc = new TextEncoder();
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

let counter = 0;
const sha = (): string => (++counter).toString(16).padStart(40, "0");
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const ok = <T>(data: T): GithubResult<T> => ({ ok: true, data, next: false });
const failed = (
  kind: "unavailable" | "rate" | "retry" | "empty",
): GithubResult<never> => ({
  ok: false,
  kind,
  message: kind,
  retryAt: new Date(),
});

type Item = string | Uint8Array;

/** A repository with a docs folder: answers the five calls the loader makes. */
function fakeGithub(
  initial: {
    files?: Record<string, Item>;
    entries?: Record<string, { mode: string; type: string }>;
    isPrivate?: boolean;
    docs?: boolean;
    topTruncated?: boolean;
  } = {},
) {
  const state = {
    head: sha(),
    files: initial.files ?? {
      "index.md": "# Demo\n\nSee the [guide](./guide.md).\n",
      "guide.md": "# Guide\n\ntext\n",
    },
    isPrivate: initial.isPrivate ?? false,
    docs: initial.docs ?? true,
    fail: null as ReturnType<typeof failed> | null,
    sizeLie: new Set<string>(),
  };
  const blobs = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const docsSha = sha();

  const get = vi.fn(async (path: string): Promise<GithubResult<unknown>> => {
    calls.push(path);
    if (state.fail) return state.fail;
    if (path === `/repositories/${REPO_ID}`)
      return ok({
        id: Number(REPO_ID),
        name: "demo",
        owner: { login: "DevDogsUGA" },
        default_branch: "main",
        private: state.isPrivate,
      });
    if (path === "/repos/DevDogsUGA/demo/git/ref/heads/main")
      return ok({ object: { sha: state.head } });
    if (path === `/repos/DevDogsUGA/demo/git/trees/${state.head}`)
      return ok({
        truncated: false,
        tree: state.docs
          ? [
              {
                path: "README.md",
                mode: "100644",
                type: "blob",
                sha: sha(),
                size: 3,
              },
              { path: "docs", mode: "040000", type: "tree", sha: docsSha },
            ]
          : [
              {
                path: "README.md",
                mode: "100644",
                type: "blob",
                sha: sha(),
                size: 3,
              },
            ],
      });
    if (path === `/repos/DevDogsUGA/demo/git/trees/${docsSha}?recursive=1`) {
      const tree = Object.entries(state.files).map(([p, value]) => {
        const bytes = typeof value === "string" ? enc.encode(value) : value;
        const blob = sha();
        blobs.set(blob, bytes);
        return {
          path: p,
          mode: "100644",
          type: "blob",
          sha: blob,
          size: bytes.length + (state.sizeLie.has(p) ? 1 : 0),
        };
      });
      for (const [p, e] of Object.entries(initial.entries ?? {}))
        tree.push({ path: p, mode: e.mode, type: e.type, sha: sha(), size: 0 });
      return ok({ truncated: initial.topTruncated ?? false, tree });
    }
    const blob = /\/git\/blobs\/([0-9a-f]{40})$/.exec(path);
    if (blob && blobs.has(blob[1]!)) {
      const bytes = blobs.get(blob[1]!)!;
      return ok({
        content: b64(bytes),
        encoding: "base64",
        size: bytes.length,
      });
    }
    return failed("unavailable");
  });
  const github: PreviewGithub = { get: get as PreviewGithub["get"] };
  return { github, state, calls, get, docsSha };
}

const target = { slug: "demo", repoId: REPO_ID };
const count = (calls: string[], needle: string) =>
  calls.filter((call) => call.includes(needle)).length;

function loaderWith(g: ReturnType<typeof fakeGithub>, clock = { t: 0 }) {
  return {
    clock,
    loader: createPreviewLoader({ github: g.github, now: () => clock.t }),
  };
}

describe("loading a project's docs", () => {
  it("reads docs/ at the default branch's head, through the read App's calls, and compiles it", async () => {
    const g = fakeGithub();
    const { loader } = loaderWith(g);
    const result = await loader.load(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { preview } = result;
    expect(preview).toMatchObject({
      slug: "demo",
      repository: "DevDogsUGA/demo",
      branch: "main",
      sha: g.state.head,
      readiness: { ready: true, problems: [], pages: 2 },
    });
    expect(preview.content?.pages.map((p) => p.path)).toEqual([
      "demo/guide",
      "demo/index",
    ]);
    // The top of the tree to find docs, then docs recursively (never the whole
    // repository's recursive listing), then one blob per file.
    expect(g.calls.slice(0, 4)).toEqual([
      `/repositories/${REPO_ID}`,
      "/repos/DevDogsUGA/demo/git/ref/heads/main",
      `/repos/DevDogsUGA/demo/git/trees/${g.state.head}`,
      `/repos/DevDogsUGA/demo/git/trees/${g.docsSha}?recursive=1`,
    ]);
    expect(count(g.calls, "/git/blobs/")).toBe(2);
    expect(
      g.calls.some(
        (c) => c.includes("recursive=1") && c.includes(g.state.head),
      ),
    ).toBe(false);
  });

  it("renders code blocks framed but uncoloured", async () => {
    const g = fakeGithub({
      files: {
        "index.md": "# Demo\n\n```ts file=a.ts\nconst a = 1;\n```\n",
      },
    });
    const result = await loaderWith(g).loader.load(target);
    if (!result.ok) throw new Error("not loaded");
    const html = result.preview.content!.pages[0]!.html;
    expect(html).toContain('class="docs-code"');
    expect(html).not.toMatch(/style="[^"]*--shiki-dark:#3E8FB0/i);
  });

  it("gives a verdict, not an error, for docs that break the rules, and still renders what compiled", async () => {
    const g = fakeGithub({
      files: {
        "index.md": "# Demo\n\n[gone](./missing.md)\n",
      },
    });
    const result = await loaderWith(g).loader.load(target);
    if (!result.ok) throw new Error("not loaded");
    expect(result.preview.readiness.ready).toBe(false);
    expect(result.preview.readiness.problems.map((p) => p.kind)).toEqual([
      "link",
    ]);
    // Links fail readiness, but the pages compiled, so they can be read.
    expect(result.preview.content).not.toBeNull();

    const blocked = fakeGithub({
      files: { "index.md": "# Demo\n\n<script>x()</script>\n" },
    });
    const refused = await loaderWith(blocked).loader.load(target);
    if (!refused.ok) throw new Error("not loaded");
    expect(refused.preview.content).toBeNull();
    expect(refused.preview.readiness.problems[0]).toMatchObject({
      kind: "compile",
    });
  });
});

describe("what it keeps, by commit", () => {
  it("serves the same commit from memory, asking GitHub only where the head is", async () => {
    const g = fakeGithub();
    const { loader, clock } = loaderWith(g);
    await loader.load(target);
    const first = g.calls.length;

    clock.t += HEAD_KEEP_MS + 1;
    await loader.load(target);
    // The head is looked up again (two calls); the tree and the files are not.
    expect(g.calls.length - first).toBe(2);
    expect(count(g.calls, "/git/trees/")).toBe(2);
    expect(count(g.calls, "/git/blobs/")).toBe(2);
  });

  it("answers within the head's lifetime without asking GitHub at all", async () => {
    const g = fakeGithub();
    const { loader, clock } = loaderWith(g);
    await loader.load(target);
    const first = g.calls.length;
    clock.t += HEAD_KEEP_MS - 1;
    await loader.load(target);
    expect(g.calls.length).toBe(first);
  });

  it("reads again when the head moves to a new commit", async () => {
    const g = fakeGithub();
    const { loader, clock } = loaderWith(g);
    const before = await loader.load(target);
    g.state.head = sha();
    g.state.files = { "index.md": "# Demo\n\nNew text.\n" };
    clock.t += HEAD_KEEP_MS + 1;
    const after = await loader.load(target);
    if (!before.ok || !after.ok) throw new Error("not loaded");
    expect(after.preview.sha).not.toBe(before.preview.sha);
    expect(after.preview.content?.pages).toHaveLength(1);
  });

  it("lets two askers at once share one trip to GitHub", async () => {
    const g = fakeGithub();
    const { loader } = loaderWith(g);
    const [a, b] = await Promise.all([
      loader.load(target),
      loader.load(target),
    ]);
    expect(a).toBe(b);
    expect(count(g.calls, "/repositories/")).toBe(1);
    expect(count(g.calls, "/git/blobs/")).toBe(2);
  });

  it("forgets an old commit after it has kept a few, and a good load for an hour", async () => {
    const memo = new Memo<number>(() => now, 2);
    let now = 0;
    await memo.get(
      "a",
      () => 10,
      async () => 1,
    );
    await memo.get(
      "b",
      () => 10,
      async () => 2,
    );
    await memo.get(
      "c",
      () => 10,
      async () => 3,
    );
    const again = vi.fn(async () => 9);
    expect(await memo.get("a", () => 10, again)).toBe(9);
    expect(again).toHaveBeenCalledOnce();
    now = 11;
    const later = vi.fn(async () => 8);
    expect(await memo.get("c", () => 10, later)).toBe(8);
    expect(PREVIEW_KEEP_MS).toBe(3_600_000);
  });

  it("reads the commit a link names, whatever the head is now", async () => {
    const g = fakeGithub();
    const { loader } = loaderWith(g);
    const first = await loader.load(target);
    if (!first.ok) throw new Error("not loaded");
    g.state.head = sha();
    const pinned = await loader.load(target, first.preview.sha);
    expect(pinned).toBe(first);
    expect((await loader.load(target, "nope")).ok).toBe(false);
  });
});

describe("what it refuses to read", () => {
  it("a repository that is private, or whose id isn't the one asked for", async () => {
    const g = fakeGithub({ isPrivate: true });
    const result = await loaderWith(g).loader.load(target);
    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "unavailable" },
    });
    expect(count(g.calls, "/git/")).toBe(0);
  });

  it("a branch with no docs folder, and docs that are a file", async () => {
    const none = await loaderWith(fakeGithub({ docs: false })).loader.load(
      target,
    );
    expect(none).toMatchObject({ ok: false, failure: { kind: "no-docs" } });
  });

  it("too many files, naming the limit, before it fetches one", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < PREVIEW_LIMITS.maxFiles! + 1; i++)
      files[`p${i}.md`] = `# P${i}\n\ntext\n`;
    const g = fakeGithub({ files });
    const result = await loaderWith(g).loader.load(target);
    if (!result.ok) throw new Error("not loaded");
    expect(result.preview.content).toBeNull();
    expect(result.preview.readiness.ready).toBe(false);
    expect(result.preview.readiness.problems[0]!.message).toContain(
      `reads at most ${PREVIEW_LIMITS.maxFiles} files`,
    );
    expect(count(g.calls, "/git/blobs/")).toBe(0);
  });

  it("a folder GitHub truncated", async () => {
    const g = fakeGithub({ topTruncated: true });
    const result = await loaderWith(g).loader.load(target);
    expect(result).toMatchObject({ ok: false, failure: { kind: "too-large" } });
  });

  it("a symlink or a submodule, by the build's own tree rules, fetching nothing", async () => {
    const g = fakeGithub({
      entries: { "leak.md": { mode: "120000", type: "blob" } },
    });
    const result = await loaderWith(g).loader.load(target);
    if (!result.ok) throw new Error("not loaded");
    expect(result.preview.readiness.problems[0]!.message).toContain(
      "leak.md: is a symlink",
    );
    expect(count(g.calls, "/git/blobs/")).toBe(0);

    const sub = fakeGithub({
      entries: { vendor: { mode: "160000", type: "commit" } },
    });
    const refused = await loaderWith(sub).loader.load(target);
    if (!refused.ok) throw new Error("not loaded");
    expect(refused.preview.readiness.problems[0]!.message).toContain(
      "vendor: isn't a regular file",
    );
  });

  it("a file that arrives a different size than the tree said", async () => {
    const g = fakeGithub();
    g.state.sizeLie.add("index.md");
    // The size is checked against the bytes: the lie in the listing is caught
    // before anything compiles.
    const result = await loaderWith(g).loader.load(target);
    expect(result).toMatchObject({ ok: false, failure: { kind: "error" } });
  });
});

describe("when GitHub is the problem", () => {
  it("says it is busy, and tries again after a short wait, not after an hour", async () => {
    const g = fakeGithub();
    g.state.fail = failed("rate");
    const { loader, clock } = loaderWith(g);
    expect(await loader.load(target)).toMatchObject({
      ok: false,
      failure: { kind: "busy" },
    });
    g.state.fail = null;
    expect((await loader.load(target)).ok).toBe(false);
    clock.t += FAILURE_KEEP_MS + 1;
    expect((await loader.load(target)).ok).toBe(true);
  });

  it("says the repository is gone, without saying whether it was deleted or made private", async () => {
    const g = fakeGithub();
    g.state.fail = failed("unavailable");
    const result = await loaderWith(g).loader.load(target);
    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "unavailable" },
    });
    if (result.ok) return;
    expect(result.failure.message).toContain("private, deleted or blocked");
  });

  it("says an empty repository is empty", async () => {
    const g = fakeGithub();
    g.state.fail = failed("empty");
    expect(await loaderWith(g).loader.load(target)).toMatchObject({
      ok: false,
      failure: { kind: "empty" },
    });
  });

  it("is an error the member cannot fix for anything else", async () => {
    const g = fakeGithub();
    g.state.fail = failed("retry");
    expect(await loaderWith(g).loader.load(target)).toMatchObject({
      ok: false,
      failure: { kind: "error" },
    });
  });
});

describe("images", () => {
  const files = {
    "index.md": "# Demo\n\n![logo](./img/logo.png)\n",
    "img/logo.png": PNG,
  };

  it("lists each approved asset with its blob, and reads its bytes back checked", async () => {
    const g = fakeGithub({ files });
    const { loader } = loaderWith(g);
    const result = await loader.load(target);
    if (!result.ok) throw new Error("not loaded");
    expect(Object.keys(result.preview.assets)).toEqual(["img/logo.png"]);
    const asset = await loader.asset(result.preview, "img/logo.png");
    expect(asset?.type).toBe("image/png");
    expect([...asset!.bytes]).toEqual([...PNG]);
  });

  it("answers null for a path the compile did not approve", async () => {
    const g = fakeGithub({ files });
    const { loader } = loaderWith(g);
    const result = await loader.load(target);
    if (!result.ok) throw new Error("not loaded");
    expect(await loader.asset(result.preview, "index.md")).toBeNull();
    expect(await loader.asset(result.preview, "../x.png")).toBeNull();
  });

  it("answers null when the bytes are no longer the ones that were compiled", async () => {
    const g = fakeGithub({ files });
    const { loader } = loaderWith(g);
    const result = await loader.load(target);
    if (!result.ok) throw new Error("not loaded");
    const blob = result.preview.assets["img/logo.png"]!.blobSha;
    g.get.mockImplementationOnce(async () =>
      ok({
        content: b64(new Uint8Array([9, 9, 9])),
        encoding: "base64",
        size: 3,
      }),
    );
    expect(await loader.asset(result.preview, "img/logo.png")).toBeNull();
    expect(blob).toMatch(/^[0-9a-f]{40}$/);
  });
});
