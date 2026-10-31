import type { DocsProjectRow, ProposalRow } from "./docsProposals";

/**
 * Where a project's docs stand, in the words the project page uses. It reads
 * only what the platform already records about the map: `docsRequested`
 * follows the central map and moves when a pull request that edits it merges,
 * `docsPausedAt` is set when the repository changed owner, `docsFirstPublishedAt`
 * is set once the first approved version is published, and a proposal row is
 * the pull request an officer opened. Nothing here claims the docs are
 * reachable by readers: only `published` says something has been published, and
 * it carries the date.
 */
export type DocsStatus =
  /** The site's own docs: bundled at build time, no repository to read. */
  | { kind: "bundled" }
  /** Not in the map. */
  | { kind: "off" }
  /** A pull request that edits the map is being opened or is open. */
  | {
      kind: "proposal";
      enable: boolean;
      /** Null while the pull request is still being opened. */
      prUrl: string | null;
    }
  /** In the map, and no version published yet. */
  | { kind: "on" }
  /** In the map, but the repository changed owner and an officer must confirm it. */
  | { kind: "paused" }
  /** In the map, and a version has published. */
  | { kind: "published"; at: Date };

export interface DocsStatusFacts {
  bundled: boolean;
  project: Pick<
    DocsProjectRow,
    "docsRequested" | "docsPausedAt" | "docsFirstPublishedAt"
  >;
  /** The proposal that is `opening` or `open`, if there is one. */
  proposal: Pick<ProposalRow, "enable" | "prUrl"> | null;
}

/**
 * The status, in order of what matters most to the reader: a pause beats an
 * open pull request (confirming the owner is what is blocking publishing), an
 * open pull request beats the state it will change, and a first publication
 * beats "on".
 */
export function docsStatusOf(facts: DocsStatusFacts): DocsStatus {
  if (facts.bundled) return { kind: "bundled" };
  const { docsRequested, docsPausedAt, docsFirstPublishedAt } = facts.project;
  if (docsRequested && docsPausedAt) return { kind: "paused" };
  if (facts.proposal)
    return {
      kind: "proposal",
      enable: facts.proposal.enable,
      prUrl: facts.proposal.prUrl,
    };
  if (!docsRequested) return { kind: "off" };
  if (docsFirstPublishedAt)
    return { kind: "published", at: docsFirstPublishedAt };
  return { kind: "on" };
}
