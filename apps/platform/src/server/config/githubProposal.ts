import { validateConfigFiles } from "@devdogsuga/events";
import {
  GithubApiError,
  githubCall,
  installationToken,
  type AppCredentials,
  type Fetch,
} from "./githubApp";
import {
  applyEdits,
  configPath,
  diffConfig,
  showValue,
  type AuthoredConfig,
  type ItemChange,
  type SavedEdit,
} from "./edits";
import { COLLECTIONS, COLLECTION_LABELS, type Collection } from "./editFields";
import { formatJson } from "./formatJson";

/**
 * Turns an officer's saved edits into a pull request, through the config-PR
 * App. Nothing here touches the database or the environment: credentials, the
 * officer and `fetch` come in, and a result comes out.
 *
 * Order matters: the base branch's files are READ first (nothing is written),
 * the edits are laid over them, and the result goes through the events
 * validator. Only a config that passes is written: a branch, one commit, a pull
 * request. A proposal that fails validation opens nothing at all.
 */

export interface Officer {
  name: string;
  /** The address on the `Co-authored-by` trailer. Never the member's school address. */
  email: string;
}

export interface ProposalInput {
  credentials: AppCredentials;
  repo: { owner: string; name: string };
  edits: readonly SavedEdit[];
  officer: Officer;
  /** A staging proposal opens a draft PR labelled `staging`. */
  staging: boolean;
  fetch?: Fetch;
  now?: () => number;
  /** For the branch name; overridable so tests are deterministic. */
  nonce?: () => string;
}

export type ProposalResult =
  | {
      status: "opened";
      url: string;
      number: number;
      branch: string;
      draft: boolean;
      files: string[];
      changes: ItemChange[];
      skipped: SavedEdit[];
    }
  | { status: "invalid"; errors: string[] }
  | { status: "nothing_to_propose" }
  | { status: "github_error"; message: string };

const BASE_FILES = [
  "meetings",
  "workshops",
  "venues",
  "series",
  "questions",
] as const;

/** A name safe on a trailer or a heading: no angle brackets or line breaks. */
export function plainName(name: string): string {
  const cleaned = name
    .replace(/[<>\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned === "" ? "A DevDogs officer" : cleaned;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** "update 2 meetings, add 1 workshop" for a title. */
export function summarize(changes: readonly ItemChange[]): string {
  const parts: string[] = [];
  for (const kind of ["changed", "added"] as const) {
    for (const collection of COLLECTIONS) {
      const n = changes.filter(
        (c) => c.kind === kind && c.collection === collection,
      ).length;
      if (n > 0) {
        parts.push(
          `${kind === "added" ? "add" : "update"} ${count(n, COLLECTION_LABELS[collection].singular)}`,
        );
      }
    }
  }
  return parts.join(", ");
}

const BODY_LINES_MAX = 60;

function changeLines(changes: readonly ItemChange[]): string[] {
  const lines: string[] = [];
  for (const change of changes) {
    const noun = COLLECTION_LABELS[change.collection].singular;
    lines.push(
      `- ${change.kind === "added" ? "Add" : "Change"} ${noun} \`${change.key}\``,
    );
    for (const field of change.fields) {
      const shown =
        change.kind === "added"
          ? `${field.label}: ${clip(showValue(field.after))}`
          : `${field.label}: ${clip(showValue(field.before))} -> ${clip(showValue(field.after))}`;
      lines.push(`  - ${shown.replace(/[\r\n]+/g, " ")}`);
    }
  }
  if (lines.length > BODY_LINES_MAX) {
    const rest = lines.length - BODY_LINES_MAX;
    return [...lines.slice(0, BODY_LINES_MAX), `- ... and ${rest} more lines`];
  }
  return lines;
}

function clip(text: string): string {
  const short = text.length > 100 ? `${text.slice(0, 97)}...` : text;
  return inlineCode(short);
}

/** Officer-entered text as inline code, so `@handle` and `#123` never notify or cross-link. */
function inlineCode(text: string): string {
  const flat = text.replace(/[\r\n]+/g, " ");
  const fence = flat.includes("`") ? "``" : "`";
  return `${fence}${flat}${fence}`;
}

export function pullRequestBody(
  officer: Officer,
  changes: readonly ItemChange[],
  staging: boolean,
): string {
  const sections = [
    staging
      ? "**Staging proposal.** Opened as a draft from the staging console; do not merge."
      : undefined,
    `Proposed by ${plainName(officer.name)}, a DevDogs officer, from the console's schedule editor. They are named as co-author on the commit; the config PRs app opened this on their behalf, so they need no access to this repository.`,
    "## Changes",
    changeLines(changes).join("\n"),
    "Review, ask for changes and merge here. The merged config is authoritative; the platform picks it up on the next deploy. Nothing in the console tracks this pull request.",
  ];
  return sections.filter((part) => part !== undefined).join("\n\n");
}

export function commitMessage(
  officer: Officer,
  changes: readonly ItemChange[],
): string {
  const name = plainName(officer.name);
  return [
    `feat(events): ${summarize(changes)}`,
    `Proposed by ${name} from the DevDogs console.`,
    `Co-authored-by: ${name} <${officer.email}>`,
  ].join("\n\n");
}

interface RepoInfo {
  default_branch: string;
}
interface RefInfo {
  object: { sha: string };
}
interface CommitInfo {
  tree: { sha: string };
}

export async function openProposal(
  input: ProposalInput,
): Promise<ProposalResult> {
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

    // Read the base branch. Nothing is written until the result validates.
    const { default_branch: base } = await call<RepoInfo>("");
    const ref = await call<RefInfo>(`/git/ref/heads/${base}`);
    const baseSha = ref.object.sha;
    const baseCommit = await call<CommitInfo>(`/git/commits/${baseSha}`);
    const texts = Object.fromEntries(
      await Promise.all(
        BASE_FILES.map(async (file) => [
          file,
          await call<string>(
            `/contents/packages/events/src/data/${file}.json?ref=${baseSha}`,
            { raw: true },
          ),
        ]),
      ),
    ) as Record<(typeof BASE_FILES)[number], string>;
    const baseConfig = Object.fromEntries(
      BASE_FILES.map((file) => [file, JSON.parse(texts[file])]),
    ) as unknown as AuthoredConfig;

    const { files: proposed, orphans } = applyEdits(baseConfig, input.edits);
    const checked = validateConfigFiles({ ...baseConfig, ...proposed });
    if (!checked.ok) return { status: "invalid", errors: checked.errors };

    const changes = diffConfig(baseConfig, proposed);
    const written: { path: string; content: string }[] = [];
    for (const collection of COLLECTIONS) {
      const key = fileKey(collection);
      const content = formatJson(proposed[key]);
      if (content !== texts[key]) {
        written.push({ path: configPath(collection), content });
      }
    }
    if (changes.length === 0 || written.length === 0) {
      return { status: "nothing_to_propose" };
    }

    const tree = await call<{ sha: string }>("/git/trees", {
      method: "POST",
      body: {
        base_tree: baseCommit.tree.sha,
        tree: written.map((file) => ({
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
        message: commitMessage(input.officer, changes),
        tree: tree.sha,
        parents: [baseSha],
      },
    });
    const branch = `config/proposal-${Math.floor((input.now?.() ?? Date.now()) / 1000)}-${(input.nonce?.() ?? crypto.randomUUID()).slice(0, 8)}`;
    await call("/git/refs", {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
    const pull = await call<{ html_url: string; number: number }>("/pulls", {
      method: "POST",
      body: {
        title: `${input.staging ? "[staging] " : ""}Config: ${summarize(changes)}`,
        head: branch,
        base,
        body: pullRequestBody(input.officer, changes, input.staging),
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
      branch,
      draft: input.staging,
      files: written.map((file) => file.path),
      changes,
      skipped: orphans.map((orphan) => orphan.edit),
    };
  } catch (error) {
    if (error instanceof GithubApiError) {
      return { status: "github_error", message: error.message };
    }
    if (error instanceof SyntaxError) {
      return {
        status: "github_error",
        message: "A config file on the base branch is not valid JSON.",
      };
    }
    throw error;
  }
}

function fileKey(collection: Collection): "meetings" | "workshops" | "venues" {
  return collection === "meeting"
    ? "meetings"
    : collection === "workshop"
      ? "workshops"
      : "venues";
}
