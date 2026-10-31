import { validateConfigFiles } from "@devdogsuga/events";
import type { AppCredentials, Fetch } from "./githubApp";
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
import { proposeTrustedFilePr, type TrustedFile } from "./trustedFilePr";

/**
 * Turns an officer's saved edits into a pull request, through the config-PR
 * App. Nothing here touches the database or the environment: credentials, the
 * officer and `fetch` come in, and a result comes out.
 *
 * The branch, commit and pull request are the shared transport's
 * (`trustedFilePr.ts`); what is here is the schedule editor's part of it. The
 * base branch's files are READ first (nothing is written), the edits are laid
 * over them, and the result goes through the events validator. Only a config
 * that passes is written. A proposal that fails validation opens nothing at
 * all.
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
  "semesters",
  "badges",
] as const;

/** A name safe on a trailer or a heading: no angle brackets or line breaks. */
export function plainName(name: string): string {
  const cleaned = name
    .replace(/[<>\r\n@#`*_~\[\]()|\\]+/g, " ")
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
/**
 * Officer text as inline code, so an @mention or #123 in it never notifies
 * anyone. The fence is one backtick longer than the longest run inside, and a
 * value that starts or ends with a backtick is padded so it can't merge in.
 */
export function inlineCode(text: string): string {
  const flat = text.replace(/[\r\n]+/g, " ");
  const longest = Math.max(
    0,
    ...(flat.match(/`+/g) ?? []).map((r) => r.length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat}${pad}${fence}`;
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

/** What the schedule editor's proposal returns beside the pull request. */
interface ConfigDetail {
  changes: ItemChange[];
  skipped: SavedEdit[];
}

export async function openProposal(
  input: ProposalInput,
): Promise<ProposalResult> {
  const branch = `config/proposal-${Math.floor((input.now?.() ?? Date.now()) / 1000)}-${(input.nonce?.() ?? crypto.randomUUID()).slice(0, 8)}`;
  const result = await proposeTrustedFilePr<ConfigDetail>({
    credentials: input.credentials,
    repo: input.repo,
    staging: input.staging,
    branch,
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.now ? { now: input.now } : {}),
    prepare: async (base) => {
      const texts = Object.fromEntries(
        await Promise.all(
          BASE_FILES.map(async (file) => [
            file,
            await base.read(`packages/events/src/data/${file}.json`),
          ]),
        ),
      ) as Record<(typeof BASE_FILES)[number], string>;
      let baseConfig: AuthoredConfig;
      try {
        baseConfig = Object.fromEntries(
          BASE_FILES.map((file) => [file, JSON.parse(texts[file])]),
        ) as unknown as AuthoredConfig;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return {
          status: "github_error",
          message: "A config file on the base branch is not valid JSON.",
        };
      }

      const { files: proposed, orphans } = applyEdits(baseConfig, input.edits);
      const checked = validateConfigFiles({ ...baseConfig, ...proposed });
      if (!checked.ok) return { status: "invalid", errors: checked.errors };

      const changes = diffConfig(baseConfig, proposed);
      const written: TrustedFile[] = [];
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
      return {
        status: "ready",
        files: written,
        commitMessage: commitMessage(input.officer, changes),
        title: `Config: ${summarize(changes)}`,
        body: pullRequestBody(input.officer, changes, input.staging),
        detail: { changes, skipped: orphans.map((orphan) => orphan.edit) },
      };
    },
  });
  if (result.status !== "opened") return result;
  return {
    status: "opened",
    url: result.url,
    number: result.number,
    branch: result.branch,
    draft: result.draft,
    files: result.files,
    changes: result.detail.changes,
    skipped: result.detail.skipped,
  };
}

function fileKey(collection: Collection): "meetings" | "workshops" | "venues" {
  return collection === "meeting"
    ? "meetings"
    : collection === "workshop"
      ? "workshops"
      : "venues";
}
