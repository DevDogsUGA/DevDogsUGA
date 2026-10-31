import {
  checkTreeEntries,
  compilePreview,
  DocsBuildError,
  type Readiness,
  type TreeEntry,
  type UntrustedCompileResult,
  type UntrustedLimits,
} from "@devdogsuga/docs-kit/preview";
import {
  newBudget,
  type Budget,
  type GithubResult,
} from "~/server/github/transport";
import type { PublishedContent } from "./published/schema";

/**
 * Reading a project's `docs/` folder live from its repository's default
 * branch, and compiling it the way the candidate pipeline does.
 *
 * The files come from the GitHub API (the read-only App's one fetcher), at one
 * commit: the default branch's head, or the commit a link names. Public
 * repositories only, so nothing here is private data, and a result is the same
 * for everyone who may ask. That is what lets it be cached by the head's SHA.
 * Who may ask is decided before this runs (`previewAccess.ts`).
 *
 * The compile is `@devdogsuga/docs-kit/preview`: the same untrusted policy and
 * readiness rules as the build, with code blocks framed but not coloured,
 * because Shiki's Oniguruma engine compiles WebAssembly and a Worker cannot.
 *
 * ## Limits
 *
 * The preview is a convenience, so it reads less than the build accepts:
 * `PREVIEW_LIMITS` caps the files, pages and bytes (each file is one blob
 * request, and one invocation of the read App's client may make 100), and the
 * whole load stops at `PREVIEW_MAX_MS`. A folder over a limit is a refusal that
 * says so, not a half-rendered preview. The count tests, caching and
 * in-flight sharing are in `previewLoader.test.ts`.
 */

export const PREVIEW_LIMITS: Partial<UntrustedLimits> = {
  maxFiles: 90,
  maxPages: 90,
  maxTotalBytes: 8 * 1024 * 1024,
};
export const PREVIEW_MAX_MS = 25_000;
/** A load that worked is good for as long as its commit exists. */
export const PREVIEW_KEEP_MS = 60 * 60 * 1000;
/** The head moves, so what it was is only recent news. */
export const HEAD_KEEP_MS = 30_000;
/** A refusal or an error might clear by itself soon. */
export const FAILURE_KEEP_MS = 30_000;
const MAX_ENTRIES = 8;
const BLOB_PARALLEL = 4;

/** The slice of the read App's client the loader uses. */
export interface PreviewGithub {
  get<T>(path: string, budget: Budget): Promise<GithubResult<T>>;
}

export type PreviewFailureKind =
  /** The repository is private, deleted or blocked; GitHub can't say which. */
  | "unavailable"
  /** GitHub is rate limiting the read App, or the load ran out of time. */
  | "busy"
  /** The read App is misconfigured or GitHub failed; nothing the member can fix. */
  | "error"
  /** The repository has no commits yet. */
  | "empty"
  /** The default branch has no `docs/` folder. */
  | "no-docs"
  /** More than the preview reads (see `PREVIEW_LIMITS`). */
  | "too-large";

export interface PreviewFailure {
  kind: PreviewFailureKind;
  message: string;
}

/** A project's docs at one commit: what the compile made of them. */
export interface LivePreview {
  slug: string;
  repoId: string;
  /** `owner/name` as GitHub spells it now. */
  repository: string;
  branch: string;
  /** The commit the files were read at. */
  sha: string;
  readiness: Readiness;
  /** The compiled project, when the pages compiled; null when they did not. */
  content: PublishedContent | null;
  /** Each asset's path, and the blob that holds its bytes. */
  assets: Record<string, { blobSha: string; type: string; sha256: string }>;
}

export type PreviewLoad =
  { ok: true; preview: LivePreview } | { ok: false; failure: PreviewFailure };

export interface PreviewTarget {
  slug: string;
  /** The numeric GitHub id of the repository the docs come from. */
  repoId: string;
}

/**
 * Keeps the answer to a question for a while, and lets two askers at once share
 * one answer rather than each making the trip. Bounded: the oldest goes first.
 */
export class Memo<T> {
  private entries = new Map<string, { until: number; value: Promise<T> }>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly capacity = MAX_ENTRIES,
  ) {}

  /** `keep` says how long the settled answer is kept, per answer. */
  async get(
    key: string,
    keep: (value: T) => number,
    make: () => Promise<T>,
  ): Promise<T> {
    const held = this.entries.get(key);
    if (held && held.until > this.now()) return held.value;
    const value = make();
    // While it is being made it is kept, so a second asker joins it.
    const entry = { until: Number.POSITIVE_INFINITY, value };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    try {
      entry.until = this.now() + keep(await value);
    } catch (error) {
      this.entries.delete(key);
      throw error;
    }
    return value;
  }
}

/** The repository as GitHub says it is now. */
interface RepoFacts {
  owner: string;
  name: string;
  branch: string;
  headSha: string;
}

type Failed = { failure: PreviewFailure };
const fail = (kind: PreviewFailureKind, message: string): Failed => ({
  failure: { kind, message },
});

/** How a GitHub failure reads to the member, and which kind it is. */
function failureOf<T>(
  result: Extract<GithubResult<T>, { ok: false }>,
  what: string,
): Failed {
  switch (result.kind) {
    case "unavailable":
      return fail(
        "unavailable",
        `GitHub can't show ${what}: the repository is private, deleted or blocked.`,
      );
    case "empty":
      return fail("empty", "The repository has no commits yet.");
    case "rate":
    case "budget":
      return fail("busy", "GitHub is busy right now. Try again in a minute.");
    case "auth":
    case "retry":
    case "branch":
      return fail(
        "error",
        "The preview can't reach GitHub right now. Try again later.",
      );
  }
}

const SHA = /^[0-9a-f]{40}$/;

/** `encodeURIComponent` per segment, for a branch like `release/1`. */
const refPath = (branch: string) =>
  branch.split("/").map(encodeURIComponent).join("/");

interface GitTree {
  tree: {
    path: string;
    mode: string;
    type: string;
    sha: string;
    size?: number;
  }[];
  truncated: boolean;
}

function base64Bytes(content: string): Uint8Array {
  const binary = atob(content.replaceAll("\n", ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface PreviewDeps {
  github: PreviewGithub;
  now?: () => number;
}

/**
 * Loads (and shares, and keeps) the previews. One per process: the memos are
 * the cache, keyed by repository and commit.
 */
export function createPreviewLoader(deps: PreviewDeps) {
  const now = deps.now ?? Date.now;
  const heads = new Memo<RepoFacts | Failed>(now);
  const previews = new Memo<PreviewLoad>(now);

  async function headOf(repoId: string): Promise<RepoFacts | Failed> {
    return heads.get(
      repoId,
      (value) => ("failure" in value ? FAILURE_KEEP_MS : HEAD_KEEP_MS),
      async () => {
        const budget = newBudget(PREVIEW_MAX_MS);
        const repo = await deps.github.get<{
          id: number;
          name: string;
          owner: { login: string };
          default_branch: string;
          private: boolean;
        }>(`/repositories/${encodeURIComponent(repoId)}`, budget);
        if (!repo.ok) return failureOf(repo, "that repository");
        // Public repositories only (D0 §8.7); never trust a different id.
        if (repo.data.private || String(repo.data.id) !== repoId)
          return fail(
            "unavailable",
            "GitHub can't show that repository: it is private, deleted or blocked.",
          );
        const { owner, name, default_branch } = repo.data;
        const ref = await deps.github.get<{ object: { sha: string } }>(
          `/repos/${owner.login}/${name}/git/ref/heads/${refPath(default_branch)}`,
          budget,
        );
        if (!ref.ok) return failureOf(ref, "its default branch");
        if (!SHA.test(ref.data.object.sha))
          return fail("error", "GitHub answered with an unreadable commit.");
        return {
          owner: owner.login,
          name,
          branch: default_branch,
          headSha: ref.data.object.sha,
        };
      },
    );
  }

  async function build(
    target: PreviewTarget,
    facts: RepoFacts,
    sha: string,
  ): Promise<PreviewLoad> {
    const budget = newBudget(PREVIEW_MAX_MS);
    const repo = `/repos/${facts.owner}/${facts.name}`;
    const summary = {
      slug: target.slug,
      repoId: target.repoId,
      repository: `${facts.owner}/${facts.name}`,
      branch: facts.branch,
      sha,
    };

    // The top level first, to find `docs`: a recursive listing of the whole
    // repository is large and can be truncated; the docs folder's is not.
    const top = await deps.github.get<GitTree>(
      `${repo}/git/trees/${sha}`,
      budget,
    );
    if (!top.ok)
      return { ok: false, failure: failureOf(top, "this commit").failure };
    const docs = top.data.tree.find((entry) => entry.path === "docs");
    if (!docs)
      return {
        ok: false,
        failure: {
          kind: "no-docs",
          message: `The default branch has no docs/ folder at ${sha.slice(0, 7)}.`,
        },
      };
    if (docs.type !== "tree")
      return {
        ok: false,
        failure: {
          kind: "no-docs",
          message: "docs is a file or a link, not a folder.",
        },
      };

    const listing = await deps.github.get<GitTree>(
      `${repo}/git/trees/${docs.sha}?recursive=1`,
      budget,
    );
    if (!listing.ok)
      return {
        ok: false,
        failure: failureOf(listing, "its docs folder").failure,
      };
    if (listing.data.truncated || listing.data.tree.length > 5_000)
      return {
        ok: false,
        failure: {
          kind: "too-large",
          message: `The docs folder has too many files to preview (the limit is ${PREVIEW_LIMITS.maxFiles}).`,
        },
      };

    const blobOf = new Map<string, string>();
    const sizeOf = new Map<string, number>();
    const entries: TreeEntry[] = listing.data.tree.map((item) => {
      if (item.type === "blob" && item.mode !== "120000") {
        blobOf.set(item.path, item.sha);
        sizeOf.set(item.path, item.size ?? 0);
      }
      return {
        path: item.path,
        type:
          item.type === "tree"
            ? "dir"
            : item.type === "commit"
              ? "submodule"
              : item.mode === "120000"
                ? "symlink"
                : "file",
        size: item.size ?? 0,
      };
    });

    // The same tree rules the build applies, before any file is fetched. A
    // refusal is the answer: a verdict with no pages, never a thrown error.
    let kinds: ReturnType<typeof checkTreeEntries>;
    try {
      kinds = checkTreeEntries(entries, PREVIEW_LIMITS);
    } catch (error) {
      if (!(error instanceof DocsBuildError)) throw error;
      const tooMany = /limit of \d+ (files|pages)|total limit/.test(
        error.message,
      );
      return {
        ok: true,
        preview: {
          ...summary,
          readiness: {
            ready: false,
            problems: [
              {
                kind: "structure",
                file: null,
                message: tooMany
                  ? `${error.message} (the live preview reads at most ${PREVIEW_LIMITS.maxFiles} files; the publishing build allows more)`
                  : error.message,
              },
            ],
            pages: 0,
            assets: 0,
          },
          content: null,
          assets: {},
        },
      };
    }

    const wanted = [...kinds.keys()];
    const files = new Map<string, Uint8Array>();
    let next = 0;
    let broken: Failed | null = null;
    await Promise.all(
      Array.from(
        { length: Math.min(BLOB_PARALLEL, wanted.length) },
        async () => {
          while (broken === null) {
            const path = wanted[next++];
            if (path === undefined) return;
            const blob = await deps.github.get<{
              content: string;
              encoding: string;
              size: number;
            }>(`${repo}/git/blobs/${blobOf.get(path)!}`, budget);
            if (!blob.ok) {
              broken = failureOf(blob, `${path}`);
              return;
            }
            if (blob.data.encoding !== "base64") {
              broken = fail(
                "error",
                `GitHub sent ${path} in a form the preview can't read.`,
              );
              return;
            }
            const bytes = base64Bytes(blob.data.content);
            // The limits were applied to the listing's sizes, so the bytes must be those.
            if (
              bytes.length !== blob.data.size ||
              bytes.length !== sizeOf.get(path)
            ) {
              broken = fail(
                "error",
                `GitHub sent ${path} at a different size than it listed.`,
              );
              return;
            }
            files.set(path, bytes);
          }
        },
      ),
    );
    if (broken !== null)
      return { ok: false, failure: (broken as Failed).failure };

    const { readiness, result } = await compilePreview(
      { entries, files },
      { project: target.slug, limits: PREVIEW_LIMITS },
    );
    const assets: LivePreview["assets"] = {};
    for (const asset of result?.assets ?? []) {
      assets[asset.path] = {
        blobSha: blobOf.get(asset.path)!,
        type: asset.type,
        sha256: asset.sha256,
      };
    }
    return {
      ok: true,
      preview: {
        ...summary,
        readiness,
        content: result === null ? null : contentOf(result),
        assets,
      },
    };
  }

  return {
    /**
     * One approved image of a loaded preview, read from its blob and checked
     * against the hash the compile took of it. Null when `rel` is not one of
     * the preview's assets, or GitHub no longer has the bytes.
     */
    async asset(
      preview: LivePreview,
      rel: string,
    ): Promise<{ bytes: Uint8Array; type: string } | null> {
      const asset = preview.assets[rel];
      if (asset === undefined) return null;
      const blob = await deps.github.get<{
        content: string;
        encoding: string;
        size: number;
      }>(
        `/repos/${preview.repository}/git/blobs/${asset.blobSha}`,
        newBudget(PREVIEW_MAX_MS),
      );
      if (!blob.ok || blob.data.encoding !== "base64") return null;
      const bytes = base64Bytes(blob.data.content);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array(bytes),
      );
      const hex = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return hex === asset.sha256 ? { bytes, type: asset.type } : null;
    },

    /**
     * The project's docs at the head of the repository's default branch, or at
     * `sha` when one is named (the page's own images ask for the commit the
     * page was read at, so they stay consistent while the head moves).
     */
    async load(target: PreviewTarget, sha?: string): Promise<PreviewLoad> {
      if (sha !== undefined && !SHA.test(sha))
        return {
          ok: false,
          failure: { kind: "error", message: "That is not a commit." },
        };
      const facts = await headOf(target.repoId);
      if ("failure" in facts) return { ok: false, failure: facts.failure };
      const at = sha ?? facts.headSha;
      return previews.get(
        `${target.repoId}@${at}:${target.slug}`,
        (value) => (value.ok ? PREVIEW_KEEP_MS : FAILURE_KEEP_MS),
        async () => {
          try {
            return await build(target, facts, at);
          } catch (error) {
            if (error instanceof DocsBuildError)
              return {
                ok: false,
                failure: { kind: "error", message: error.message },
              };
            throw error;
          }
        },
      );
    },
  };
}

/** The compiled project in the shape a published one has, so the same routes render it. */
function contentOf(result: UntrustedCompileResult): PublishedContent {
  return {
    version: 1,
    project: {
      slug: result.project.slug,
      name: result.project.name,
      description: result.project.description,
      order: result.project.order,
      os: result.project.os,
    },
    folders: result.folders.map((folder) => ({
      path: folder.path,
      name: folder.name,
      description: folder.description,
      order: folder.order,
      steps: folder.steps,
    })),
    assets: result.assets.map(({ path, type, bytes, sha256 }) => ({
      path,
      type,
      bytes,
      sha256,
    })),
    pages: result.pages.map((page) => ({
      path: page.path,
      title: page.title,
      description: page.description,
      order: page.order,
      section: page.section,
      headings: page.headings,
      html: page.html,
    })),
  };
}
