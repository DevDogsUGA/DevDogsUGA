import { ExpectedFailure } from "~/lib/actionResult";
import { rules, type Caller } from "~/server/auth/access";
import {
  inlineCode,
  plainName,
  type Officer,
} from "~/server/config/githubProposal";
import type { AppCredentials } from "~/server/config/githubApp";
import type {
  TrustedPrInput,
  TrustedPrRecovered,
  TrustedPrResult,
} from "~/server/config/trustedFilePr";
import {
  MAP_SLUG,
  PROJECT_MAP_PATH,
  RESERVED_DOCS_SLUGS,
  entryFor,
  parseProjectMap,
  sameEntry,
  serializeProjectMap,
  withProject,
  withoutProject,
  type MapEntry,
  type ProjectMap,
} from "./projectMap";

/**
 * An officer's request to publish (or stop publishing) a project's docs, from
 * the request to the pull request that changes the central map, and the
 * bookkeeping that follows the pull request to its end.
 *
 * The map (`.github/docs-projects.json`) is the one place that decides which
 * projects publish, and it only changes through a reviewed pull request. So
 * nothing here ever claims docs are live: `docsRequested` on the project
 * follows the map, and moves only when the pull request that edits the map is
 * merged (`reconcileDocsProposals`). Publishing itself still waits for the
 * docs-publishing environment's approval on each snapshot.
 *
 * Everything outside the rules is injected (`DocsDeps`): the database as a
 * `DocsStore`, GitHub as the shared PR transport, the clock-free helpers. The
 * production wiring is `docsDeps.ts`; the tests pass in-memory fakes, and the
 * store's SQL is proved against Postgres in `docsStore.db-test.ts`.
 *
 * ## Idempotency
 *
 * A request writes a `projectDocsProposals` row (`opening`) before it writes to
 * GitHub, names the pull request's branch after the row's id, and moves the row
 * to `open` once the pull request exists. A retry after any failure finds the
 * row, reuses its id, and the transport (`resumable`) answers with the pull
 * request already open from that branch instead of opening a second. At most
 * one proposal per project is `opening` or `open` (a partial unique index), and
 * the same index is what holds the project's slug still while a proposal is in
 * flight (`guard_project_structure`).
 */

/** What an officer asked for. */
export type DocsChange = "enable" | "disable" | "confirm";

export type ProposalState = "opening" | "open" | "merged" | "closed" | "failed";

export interface DocsProjectRow {
  id: string;
  name: string;
  slug: string | null;
  docsRepoId: string | null;
  docsRequested: boolean;
  docsPausedAt: Date | null;
  docsFirstPublishedAt: Date | null;
}

/** A repository linked to a project, with what the proposal needs from its cache. */
export interface DocsRepoRow {
  githubRepoId: string;
  ownerId: string;
  owner: string;
  name: string;
  approved: boolean;
  available: boolean;
}

export interface ProposalRow {
  id: string;
  projectId: string;
  requestedBy: string | null;
  enable: boolean;
  githubRepoId: string;
  ownerId: string;
  slug: string;
  prNumber: number | null;
  prUrl: string | null;
  state: ProposalState;
  createdAt: Date;
}

export interface NewProposal {
  id: string;
  projectId: string;
  requestedBy: string;
  enable: boolean;
  githubRepoId: string;
  ownerId: string;
  slug: string;
  baseSha: string;
}

/** The database half of the docs proposals. */
export interface DocsStore {
  loadProject(
    projectId: string,
  ): Promise<{ project: DocsProjectRow; repos: DocsRepoRow[] } | null>;
  /** The project's proposal that is `opening` or `open`, if any. */
  activeProposal(projectId: string): Promise<ProposalRow | null>;
  /**
   * Records the proposal as `opening`, or refreshes the base commit of one that
   * is already `opening` under this id, and makes the repository the project's
   * docs repository when it has none (the owner-change pause is keyed by it).
   * Throws `ExpectedFailure` when another proposal for the project is in flight.
   */
  beginProposal(proposal: NewProposal): Promise<void>;
  markOpen(id: string, pull: { number: number; url: string }): Promise<void>;
  /** Keeps the row `opening` (a retry resumes it) and notes why it stalled. */
  noteError(id: string, message: string): Promise<void>;
  markFailed(id: string, message: string): Promise<void>;
  /**
   * The map already matched the request: bring `docsRequested` into line, and
   * when turning it on, make `githubRepoId` the docs repository if there is
   * none (the owner-change pause is keyed by it).
   */
  setRequested(
    projectId: string,
    requested: boolean,
    githubRepoId: string,
  ): Promise<void>;
  /** The proposals still `opening` or `open`, oldest first. */
  inFlight(limit: number): Promise<ProposalRow[]>;
  /** The pull request merged: apply it to the project, and say so in the audit log. */
  settleMerged(proposal: ProposalRow): Promise<void>;
  /** The pull request closed unmerged: the previous effective state stands. */
  settleClosed(proposal: ProposalRow): Promise<void>;
  /**
   * Records the first publication of the project with this slug, from a
   * pointer the publish job wrote, if its docs are on and none was recorded.
   * Once set it never changes, and it freezes the slug (the database enforces
   * both). True when this call set it.
   */
  markPublished(slug: string, at: Date): Promise<boolean>;
  /** Writes the audit row for a pull request that was opened. */
  audit(entry: {
    actorId: string;
    projectId: string;
    change: DocsChange;
    slug: string;
    url: string;
    number: number;
    branch: string;
    staging: boolean;
  }): Promise<void>;
}

/** What the proposal hands the transport to be returned with the pull request. */
export type MapDetail = { summary: string };

export interface DocsDeps {
  store: DocsStore;
  propose: (
    input: TrustedPrInput<MapDetail> & { resumable: true },
  ) => Promise<TrustedPrResult<MapDetail> | TrustedPrRecovered>;
  officerIdentity(userId: string): Promise<Officer>;
  /** False once the officer has used up their pull requests for the hour. */
  consumeRateLimit(userId: string): Promise<boolean>;
  /** The writer App's credentials; null when they are not configured. */
  credentials(): AppCredentials | null;
  /** The repository that holds the map. */
  repo: { owner: string; name: string };
  staging(): boolean;
  /** Slugs the site's own bundled docs use, which a project can't take. */
  bundledSlugs(): readonly string[];
  newId(): string;
}

export type DocsProposalOutcome =
  /** A pull request is open (new, or the one a retry found). */
  | { kind: "pending"; url: string; number: number; recovered: boolean }
  /** The map already says what was asked; nothing was proposed. */
  | { kind: "unchanged"; message: string };

const BRANCH_PREFIX = "docs-map/";
/** An `opening` proposal with no pull request after this long is given up on. */
const OPENING_GRACE_MS = 60 * 60 * 1000;

/** The branch a proposal's pull request is opened from. */
export const proposalBranch = (id: string) => `${BRANCH_PREFIX}${id}`;

/**
 * Picks the repository the docs come from: the project's `docsRepoId`, or its
 * only linked repository.
 */
export function docsRepo(
  project: DocsProjectRow,
  repos: readonly DocsRepoRow[],
): DocsRepoRow | null {
  if (project.docsRepoId !== null) {
    return repos.find((r) => r.githubRepoId === project.docsRepoId) ?? null;
  }
  return repos.length === 1 ? repos[0]! : null;
}

function summaryOf(change: DocsChange, slug: string): string {
  return change === "enable"
    ? `add ${slug} to the project docs`
    : change === "disable"
      ? `remove ${slug} from the project docs`
      : `confirm the new owner of ${slug}'s repository`;
}

function pullRequestBody(
  officer: Officer,
  change: DocsChange,
  project: DocsProjectRow,
  slug: string,
  entry: MapEntry | null,
  staging: boolean,
): string {
  const what =
    change === "enable"
      ? `Publish the docs of ${inlineCode(project.name)} (slug ${inlineCode(slug)}) from its repository's default branch.`
      : change === "disable"
        ? `Stop publishing the docs of ${inlineCode(project.name)} (slug ${inlineCode(slug)}). Its published pages stay up until they are removed.`
        : `Confirm that ${inlineCode(project.name)}'s repository now belongs to ${inlineCode(entry?.ownerLogin ?? "")} so its docs can publish again.`;
  return [
    staging
      ? "**Staging proposal.** Opened as a draft from the staging dashboard; do not merge."
      : undefined,
    `Proposed by ${plainName(officer.name)}, a DevDogs officer, from the dashboard's Docs toggle. They are named as co-author on the commit; the config PRs app opened this on their behalf.`,
    what,
    entry
      ? `Repository id ${inlineCode(entry.githubRepoId)}, owner ${inlineCode(`${entry.ownerLogin} (${entry.ownerId})`)}.`
      : undefined,
    "This changes only `.github/docs-projects.json`. Review it and merge here. Merging does not publish anything: each snapshot of the docs still waits for approval in the `docs-publishing` environment. Closing this without merging changes nothing.",
  ]
    .filter((part) => part !== undefined)
    .join("\n\n");
}

/**
 * Opens (or finds) the pull request that makes the map say what the officer
 * asked. Throws `ExpectedFailure` for every refusal a person can cause.
 *
 * @param change `enable` adds the project, `disable` removes it, `confirm`
 *   records the repository's new owner after a transfer.
 */
export async function proposeDocsChange(
  deps: DocsDeps,
  caller: Caller,
  projectId: string,
  change: DocsChange,
): Promise<DocsProposalOutcome> {
  if (!rules.officer(caller))
    throw new ExpectedFailure("Only officers can change a project's docs.");
  const { store } = deps;
  const loaded = await store.loadProject(projectId);
  if (!loaded) throw new ExpectedFailure("That project was not found.");
  const { project, repos } = loaded;

  const slug = project.slug;
  if (slug === null)
    throw new ExpectedFailure(
      "This project has no slug yet, so it has no docs address.",
    );
  if (
    !MAP_SLUG.test(slug) ||
    RESERVED_DOCS_SLUGS.has(slug) ||
    deps.bundledSlugs().includes(slug)
  )
    throw new ExpectedFailure(
      "This project's docs address belongs to the docs bundled with the site, so it can't publish from its own repository.",
    );

  const enable = change !== "disable";
  // One proposal per project is ever in flight. The same request again answers
  // with its pull request; an `opening` one (an earlier attempt that died on the
  // way) is resumed under its own id, so its branch and pull request are found,
  // not duplicated; anything else in flight is a refusal.
  let resume: ProposalRow | null = null;
  const active = await store.activeProposal(projectId);
  if (active) {
    if (active.enable !== enable) {
      throw new ExpectedFailure(
        active.state === "open"
          ? `A docs pull request is already open for this project${active.prNumber ? ` (#${active.prNumber})` : ""}. Merge or close it first.`
          : "A docs change for this project is still being opened. Try again in a minute.",
      );
    }
    if (active.state === "open" && active.prUrl) {
      return {
        kind: "pending",
        url: active.prUrl,
        number: active.prNumber ?? 0,
        recovered: true,
      };
    }
    resume = active;
  }

  if (change === "enable") {
    if (project.docsPausedAt)
      throw new ExpectedFailure(
        "This project's docs are paused because its repository changed owner. Confirm the new owner instead.",
      );
    if (project.docsRequested)
      return { kind: "unchanged", message: "Docs are already turned on." };
  } else if (change === "disable") {
    if (!project.docsRequested)
      return { kind: "unchanged", message: "Docs are already turned off." };
  } else {
    if (!project.docsRequested)
      throw new ExpectedFailure(
        "Docs aren't turned on for this project. Turn them on instead.",
      );
    if (!project.docsPausedAt)
      throw new ExpectedFailure("This project's docs aren't paused.");
  }

  const repo = docsRepo(project, repos);
  if (!repo)
    throw new ExpectedFailure(
      project.docsRepoId === null && repos.length > 1
        ? "This project has several repositories. Choose which one holds its docs first."
        : "This project has no repository to publish docs from.",
    );
  if (enable && !(repo.approved && repo.available))
    throw new ExpectedFailure(
      !repo.approved
        ? "The repository isn't approved yet."
        : "The repository is unavailable (private or deleted), so there is nothing to publish.",
    );

  const credentials = deps.credentials();
  if (!credentials)
    throw new ExpectedFailure(
      "Opening pull requests isn't set up in this environment.",
    );
  if (!(await deps.consumeRateLimit(caller.userId)))
    throw new ExpectedFailure(
      "That's a lot of pull requests this hour. Try again later.",
    );

  const entry: MapEntry = {
    githubRepoId: repo.githubRepoId,
    ownerId: repo.ownerId,
    ownerLogin: repo.owner,
  };
  const id = resume?.id ?? deps.newId();
  const branch = proposalBranch(id);
  const staging = deps.staging();
  const officer = await deps.officerIdentity(caller.userId);
  let began = false;

  const result = await deps.propose({
    credentials,
    repo: deps.repo,
    staging,
    branch,
    resumable: true,
    prepare: async (base) => {
      const parsed = parseProjectMap(await base.read(PROJECT_MAP_PATH));
      if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
      const current = entryFor(parsed.map, slug);

      let next: ProjectMap;
      if (change === "disable") {
        if (!current) return { status: "nothing_to_propose" };
        next = withoutProject(parsed.map, slug);
      } else if (change === "confirm") {
        if (!current)
          return {
            status: "invalid",
            errors: [
              "The project isn't in the map yet; turn its docs on first.",
            ],
          };
        if (current.githubRepoId !== entry.githubRepoId)
          return {
            status: "invalid",
            errors: [
              "The map names a different repository for this project than the one linked now.",
            ],
          };
        if (sameEntry(current, entry)) return { status: "nothing_to_propose" };
        next = withProject(parsed.map, slug, entry);
      } else {
        if (current && sameEntry(current, entry))
          return { status: "nothing_to_propose" };
        next = withProject(parsed.map, slug, entry);
      }

      // What goes out must be what the workflow accepts.
      const content = serializeProjectMap(next);
      const checked = parseProjectMap(content);
      if (!checked.ok) return { status: "invalid", errors: checked.errors };

      const summary = summaryOf(change, slug);
      return {
        status: "ready",
        files: [{ path: PROJECT_MAP_PATH, content }],
        commitMessage: [
          `chore(docs): ${summary}`,
          `Proposed by ${plainName(officer.name)} from the DevDogs dashboard.`,
          `Co-authored-by: ${plainName(officer.name)} <${officer.email}>`,
        ].join("\n\n"),
        title: `Docs: ${summary}`,
        body: pullRequestBody(
          officer,
          change,
          project,
          slug,
          change === "disable" ? current : entry,
          staging,
        ),
        detail: { summary },
      };
    },
    beforeWrite: async (base) => {
      await store.beginProposal({
        id,
        projectId,
        requestedBy: caller.userId,
        enable,
        githubRepoId: repo.githubRepoId,
        ownerId: repo.ownerId,
        slug,
        baseSha: base.sha,
      });
      began = true;
    },
  });

  switch (result.status) {
    case "opened":
    case "recovered": {
      const pull = { number: result.number, url: result.url };
      await store.markOpen(id, pull);
      if (result.status === "opened") {
        await store
          .audit({
            actorId: caller.userId,
            projectId,
            change,
            slug,
            url: result.url,
            number: result.number,
            branch,
            staging,
          })
          .catch((error: unknown) => {
            // The pull request exists either way; losing the audit row must
            // not hide that from the officer.
            console.error("project.docs_pr_opened audit row failed", error);
          });
      }
      return {
        kind: "pending",
        url: result.url,
        number: result.number,
        recovered: result.status === "recovered",
      };
    }
    case "nothing_to_propose": {
      // The map already says what was asked; bring the project's flag into line.
      await store.setRequested(projectId, enable, repo.githubRepoId);
      return {
        kind: "unchanged",
        message:
          change === "confirm"
            ? "The map already has this owner."
            : change === "enable"
              ? "The map already lists this project's docs."
              : "The map doesn't list this project's docs.",
      };
    }
    case "invalid":
      throw new ExpectedFailure(result.errors.join(" "));
    case "github_error":
      if (began) await store.noteError(id, result.message);
      throw new ExpectedFailure(
        `GitHub didn't accept the pull request: ${result.message}`,
      );
  }
}

/** A pull request as reconciliation needs it. */
export type PullState =
  | { kind: "open" }
  | { kind: "merged" }
  | { kind: "closed" }
  /** No such pull request, or GitHub couldn't be asked right now. */
  | { kind: "unknown" };

export interface ReconcileDeps {
  store: DocsStore;
  /** The pull request by number. */
  pullState(number: number): Promise<PullState>;
  /** The pull request opened from a proposal's branch, if one exists. */
  pullForBranch(
    branch: string,
  ): Promise<{ number: number; url: string; state: PullState } | null>;
  now(): number;
}

export interface ReconcileResult {
  checked: number;
  merged: number;
  closed: number;
  failed: number;
}

/**
 * Follows every in-flight docs proposal to the end of its pull request: a
 * merged one applies to the project (`docsRequested` follows the map), a closed
 * one changes nothing, and an `opening` one whose pull request never appeared
 * is given up after an hour so the project's slug and toggle are free again.
 *
 * GitHub failures leave a proposal as it is for the next run. Idempotent: a
 * settled proposal is no longer in flight, and settling is one transaction.
 */
export async function reconcileDocsProposals(
  deps: ReconcileDeps,
  limit = 20,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    checked: 0,
    merged: 0,
    closed: 0,
    failed: 0,
  };
  for (const proposal of await deps.store.inFlight(limit)) {
    result.checked++;
    let row = proposal;
    let state: PullState;
    if (row.prNumber === null) {
      const found = await deps.pullForBranch(proposalBranch(row.id));
      if (!found) {
        if (deps.now() - row.createdAt.getTime() > OPENING_GRACE_MS) {
          await deps.store.markFailed(
            row.id,
            "The pull request was never opened",
          );
          result.failed++;
        }
        continue;
      }
      await deps.store.markOpen(row.id, {
        number: found.number,
        url: found.url,
      });
      row = { ...row, prNumber: found.number, prUrl: found.url, state: "open" };
      state = found.state;
    } else {
      state = await deps.pullState(row.prNumber);
    }
    if (state.kind === "merged") {
      await deps.store.settleMerged(row);
      result.merged++;
    } else if (state.kind === "closed") {
      await deps.store.settleClosed(row);
      result.closed++;
    }
  }
  return result;
}

/**
 * Records the first publication of every project whose docs have published,
 * from the bucket's pointers: `docsFirstPublishedAt` is the pointer's own
 * `publishedAt`, which the publish job writes last, after an approved upload
 * succeeded. Nothing here decides that a publish happened; it only notices one.
 * Returns how many projects it newly recorded.
 */
export async function recordPublications(
  store: DocsStore,
  pointers: readonly { project: string; publishedAt: string }[],
): Promise<number> {
  let recorded = 0;
  for (const pointer of pointers) {
    const at = new Date(pointer.publishedAt);
    if (Number.isNaN(at.getTime())) continue;
    if (await store.markPublished(pointer.project, at)) recorded++;
  }
  return recorded;
}
