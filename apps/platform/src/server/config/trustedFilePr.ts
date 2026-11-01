import {
  GithubApiError,
  githubCall,
  installationToken,
  type AppCredentials,
  type Fetch,
} from "./githubApp";

/**
 * Proposes a change to files in a trusted repository as a pull request, through
 * the config-PR App. This is the transport the schedule editor's proposal
 * (`githubProposal.ts`) and the project docs map's (`server/docs/proposeDocs.ts`)
 * share. It knows nothing about either: the caller's `prepare` reads what it
 * needs from the base branch, decides what the files should become, and the
 * transport writes them as a branch, one commit and a pull request.
 *
 * Nothing here touches the database or the environment: credentials, `fetch`
 * and the clock come in, and a result comes out. The order matters and is the
 * schedule editor's: the base branch is READ first and nothing is written
 * until `prepare` has accepted the result, so a refused proposal opens
 * nothing at all.
 *
 * A proposal that has to survive a retry (`resumable`) is keyed by its branch
 * name. Asked again, the transport first looks for a pull request already open
 * from that branch and answers with it instead of opening a second one, and if
 * the branch exists without a pull request (a crash between the two writes) it
 * opens the pull request from the branch it finds. The schedule editor's
 * branches carry a random nonce, so it has nothing to resume and does not ask.
 */

export interface TrustedFile {
  path: string;
  content: string;
}

/** The base branch, as `prepare` and `beforeWrite` see it. */
export interface TrustedBase {
  /** The repository's default branch: the pull request's base. */
  branch: string;
  /** The commit the branch pointed at when it was read. */
  sha: string;
  /** A file's text at that commit. A missing file is a `GithubApiError`. */
  read(path: string): Promise<string>;
}

/** What `prepare` hands back when the proposal should go ahead. */
export interface TrustedDraft<Detail> {
  status: "ready";
  /** Only the files that changed. */
  files: TrustedFile[];
  /** The commit message, trailers included. */
  commitMessage: string;
  title: string;
  body: string;
  /** Whatever the caller wants back with the opened result. */
  detail: Detail;
}

/** Why a proposal opened nothing. */
export type TrustedRefusal =
  | { status: "invalid"; errors: string[] }
  | { status: "nothing_to_propose" }
  | { status: "github_error"; message: string };

export interface TrustedPrInput<Detail> {
  credentials: AppCredentials;
  repo: { owner: string; name: string };
  /** A staging proposal opens a draft PR labelled `staging`. */
  staging: boolean;
  /** The branch to create, `<kind>/<unique>`. */
  branch: string;
  fetch?: Fetch;
  now?: () => number;
  /** Reads the base, validates, and says what to write. Nothing is written yet. */
  prepare(base: TrustedBase): Promise<TrustedDraft<Detail> | TrustedRefusal>;
  /**
   * Runs after `prepare` accepted and before the first write, for the caller to
   * record what it is about to do (the docs proposal's database row). It may
   * throw: the error propagates and nothing has been written to GitHub.
   */
  beforeWrite?(base: TrustedBase, draft: TrustedDraft<Detail>): Promise<void>;
  /** Look for this branch's pull request first; see the file comment. */
  resumable?: boolean;
}

export interface TrustedPrOpened<Detail> {
  status: "opened";
  url: string;
  number: number;
  branch: string;
  draft: boolean;
  files: string[];
  /** The commit the pull request was proposed against. */
  baseSha: string;
  detail: Detail;
}

/** A resumable proposal whose pull request already existed. */
export interface TrustedPrRecovered {
  status: "recovered";
  url: string;
  number: number;
  branch: string;
}

export type TrustedPrResult<Detail> = TrustedPrOpened<Detail> | TrustedRefusal;

interface RepoInfo {
  default_branch: string;
}
interface RefInfo {
  object: { sha: string };
}
interface CommitInfo {
  tree: { sha: string };
}
interface PullInfo {
  html_url: string;
  number: number;
}

export function proposeTrustedFilePr<Detail>(
  input: TrustedPrInput<Detail> & { resumable: true },
): Promise<TrustedPrResult<Detail> | TrustedPrRecovered>;
export function proposeTrustedFilePr<Detail>(
  input: TrustedPrInput<Detail> & { resumable?: false },
): Promise<TrustedPrResult<Detail>>;
export function proposeTrustedFilePr<Detail>(
  input: TrustedPrInput<Detail>,
): Promise<TrustedPrResult<Detail> | TrustedPrRecovered>;
export async function proposeTrustedFilePr<Detail>(
  input: TrustedPrInput<Detail>,
): Promise<TrustedPrResult<Detail> | TrustedPrRecovered> {
  const doFetch = input.fetch ?? fetch;
  const { owner, name } = input.repo;
  const repoPath = `/repos/${owner}/${name}`;
  try {
    const token = await installationToken(
      input.credentials,
      input.repo,
      doFetch,
      input.now?.() ?? Date.now(),
    );
    const call = <T>(path: string, init?: Parameters<typeof githubCall>[3]) =>
      githubCall<T>(doFetch, token, `${repoPath}${path}`, init);

    if (input.resumable) {
      const [existing] = await call<PullInfo[]>(
        `/pulls?head=${encodeURIComponent(`${owner}:${input.branch}`)}&state=all&per_page=1`,
      );
      if (existing) {
        return {
          status: "recovered",
          url: existing.html_url,
          number: existing.number,
          branch: input.branch,
        };
      }
    }

    // Read the base branch. Nothing is written until the result validates.
    const { default_branch: branch } = await call<RepoInfo>("");
    const ref = await call<RefInfo>(`/git/ref/heads/${branch}`);
    const baseSha = ref.object.sha;
    const baseCommit = await call<CommitInfo>(`/git/commits/${baseSha}`);
    const base: TrustedBase = {
      branch,
      sha: baseSha,
      read: (path) =>
        call<string>(`/contents/${path}?ref=${baseSha}`, { raw: true }),
    };

    const draft = await input.prepare(base);
    if (draft.status !== "ready") return draft;
    if (draft.files.length === 0) return { status: "nothing_to_propose" };
    await input.beforeWrite?.(base, draft);

    const branchExists =
      input.resumable === true &&
      (await call<RefInfo>(`/git/ref/heads/${input.branch}`).then(
        () => true,
        (error: unknown) => {
          if (error instanceof GithubApiError && error.status === 404)
            return false;
          throw error;
        },
      ));
    if (!branchExists) {
      const tree = await call<{ sha: string }>("/git/trees", {
        method: "POST",
        body: {
          base_tree: baseCommit.tree.sha,
          tree: draft.files.map((file) => ({
            path: file.path,
            mode: "100644",
            type: "blob",
            content: file.content,
          })),
        },
      });
      const commit = await call<{ sha: string }>("/git/commits", {
        method: "POST",
        body: {
          message: draft.commitMessage,
          tree: tree.sha,
          parents: [baseSha],
        },
      });
      await call("/git/refs", {
        method: "POST",
        body: { ref: `refs/heads/${input.branch}`, sha: commit.sha },
      });
    }
    const pull = await call<{ html_url: string; number: number }>("/pulls", {
      method: "POST",
      body: {
        title: `${input.staging ? "[staging] " : ""}${draft.title}`,
        head: input.branch,
        base: branch,
        body: draft.body,
        draft: input.staging,
      },
    });
    if (input.staging) {
      // The label may already exist (422); any other failure is logged, and
      // never undoes the PR.
      await call("/labels", {
        method: "POST",
        body: { name: "staging", color: "fbca04" },
      }).catch((error: unknown) => {
        if (!(error instanceof GithubApiError && error.status === 422)) {
          console.error("Could not create the staging label:", error);
        }
      });
      await call(`/issues/${pull.number}/labels`, {
        method: "POST",
        body: { labels: ["staging"] },
      }).catch((error: unknown) => {
        console.error(`Could not label PR #${pull.number} staging:`, error);
      });
    }
    return {
      status: "opened",
      url: pull.html_url,
      number: pull.number,
      branch: input.branch,
      draft: input.staging,
      files: draft.files.map((file) => file.path),
      baseSha,
      detail: draft.detail,
    };
  } catch (error) {
    if (error instanceof GithubApiError) {
      return { status: "github_error", message: error.message };
    }
    throw error;
  }
}
