/**
 * The Record rules for Projects and EL reports: the checks that need the
 * record itself. They are pure, so the store can read the facts once, inside
 * its transaction, and every rule is testable without a database. The Access
 * module's rules (`rules.officer`, `rules.reviewProjectReports`) are passed in
 * as plain booleans.
 *
 * Who may do what, in one place:
 *   - edit a Project (name, description, tags, repos, lifecycle): an Owner, or
 *     any Officer when the Project is DevDogs-owned;
 *   - add or remove Owners, un-archive, and the officer-only actions: an
 *     Owner or an Officer for the first two, an Officer alone for the rest;
 *   - file an EL report: a Contributor, never an Officer (Q125);
 *   - review one: the Project's advisor or a holder of `reviewProjectReports`,
 *     never its author.
 */

export type ProjectStatus = "active" | "archived";

/** The facts about a Project that its Record rules read. */
export interface ProjectFacts {
  status: string;
  devdogsOwned: boolean;
  advisorId: string | null;
  ownerIds: readonly string[];
}

/** The member acting, as the Record rules need them. */
export interface RecordActor {
  userId: string;
  /** `rules.officer(caller)`. */
  isOfficer: boolean;
}

export function isOwner(project: ProjectFacts, actor: RecordActor): boolean {
  return project.ownerIds.includes(actor.userId);
}

/**
 * The binding rule (D0 section 8.1): an explicit owner row, or an Officer on a
 * DevDogs-owned Project. Officers are never copied into the owner rows.
 */
export function mayEdit(project: ProjectFacts, actor: RecordActor): boolean {
  return isOwner(project, actor) || (project.devdogsOwned && actor.isOfficer);
}

/** Owners add and remove co-owners, and Officers may on any Project (Q40). */
export function mayManageOwners(
  project: ProjectFacts,
  actor: RecordActor,
): boolean {
  return isOwner(project, actor) || actor.isOfficer;
}

/** Owners and Officers bring an archived Project back (Q24). */
export function mayUnarchive(
  project: ProjectFacts,
  actor: RecordActor,
): boolean {
  return isOwner(project, actor) || actor.isOfficer;
}

/** A refusal reads as a sentence the member can act on. */
export type Refusal = string;

/** Why a Project cannot be archived by this actor, or null. */
export function archiveBlock(
  project: ProjectFacts,
  actor: RecordActor,
): Refusal | null {
  if (!mayEdit(project, actor)) return "Only a project owner can do that.";
  if (project.status === "archived") return "That project is already archived.";
  return null;
}

/** Why a Project cannot be un-archived by this actor, or null. */
export function unarchiveBlock(
  project: ProjectFacts,
  actor: RecordActor,
  approvedLinks: number,
): Refusal | null {
  if (!mayUnarchive(project, actor))
    return "Only a project owner or an officer can do that.";
  if (project.status === "active") return "That project is already active.";
  return activationBlock(approvedLinks);
}

/** A Project is active only with at least one approved repo link. */
export function activationBlock(approvedLinks: number): Refusal | null {
  return approvedLinks > 0
    ? null
    : "A project needs at least one approved repository before it can be active.";
}

/** What deleting a Project would take with it, counted by the store. */
export interface DeleteFacts {
  reports: number;
  submissions: number;
}

/** Why a Project cannot be deleted by this actor, or null (Q24, Q54). */
export function deleteBlock(
  project: ProjectFacts,
  actor: RecordActor,
  facts: DeleteFacts,
): Refusal | null {
  if (!mayEdit(project, actor)) return "Only a project owner can do that.";
  if (project.devdogsOwned) return "A DevDogs-owned project cannot be deleted.";
  if (facts.reports > 0 || facts.submissions > 0)
    return "A project with reports or submissions cannot be deleted. Archive it instead.";
  return null;
}

/** Why the actor cannot take an officer-only action, or null. */
export function officerBlock(actor: RecordActor): Refusal | null {
  return actor.isOfficer ? null : "Only an officer can do that.";
}

/** One repo link, as the link rules read it. */
export type LinkFacts = {
  githubRepoId: string;
  approval: string;
};

/** Why a repo link cannot be added, or null. */
export function linkBlock(
  links: readonly LinkFacts[],
  githubRepoId: string,
  max: number,
): Refusal | null {
  if (links.some((link) => link.githubRepoId === githubRepoId))
    return "That repository is already linked.";
  if (links.length >= max)
    return `A project links at most ${max} repositories.`;
  return null;
}

/**
 * Why a repo link cannot be removed, or null. The last link stays, and so does
 * the last approved link of an active Project, and any link an existing
 * citation depends on. A pending or declined link can always go.
 */
export function unlinkBlock(
  project: ProjectFacts,
  links: readonly LinkFacts[],
  githubRepoId: string,
  citedRepoIds: ReadonlySet<string>,
): Refusal | null {
  const link = links.find((l) => l.githubRepoId === githubRepoId);
  if (!link) return "That repository is not linked to this project.";
  if (links.length <= 1) return "A project keeps at least one repository.";
  if (citedRepoIds.has(githubRepoId))
    return "Reports cite commits from that repository, so its link has to stay.";
  const approved = links.filter((l) => l.approval === "approved");
  if (
    project.status === "active" &&
    link.approval === "approved" &&
    approved.length <= 1
  )
    return "An active project keeps at least one approved repository.";
  return null;
}

// ── Reports ─────────────────────────────────────────────────────────────────

export type FileVerdict = "yes" | "officer" | "not_contributor" | "not_active";

/**
 * May this member file an EL report on the Project? Officers never do: their
 * hours are a separate process (Q125). Otherwise it takes an active Project
 * and a Contributor, someone with stored commits in one of its repos.
 */
export function fileVerdict(facts: {
  isOfficer: boolean;
  isContributor: boolean;
  projectStatus: string;
}): FileVerdict {
  if (facts.isOfficer) return "officer";
  if (facts.projectStatus !== "active") return "not_active";
  if (!facts.isContributor) return "not_contributor";
  return "yes";
}

export const FILE_REFUSAL: Record<Exclude<FileVerdict, "yes">, Refusal> = {
  officer:
    "Leadership's EL hours are handled separately, not through project reports.",
  not_active: "Reports are taken only for active projects.",
  not_contributor:
    "Only members with commits in this project's repositories can file a report. Refresh the commits if yours are missing.",
};

export type EditVerdict = "yes" | "not_author" | "approved";

/** The author edits or deletes a report until it is approved, and again once returned. */
export function editVerdict(report: {
  status: string;
  authorId: string;
  actorId: string;
}): EditVerdict {
  if (report.authorId !== report.actorId) return "not_author";
  if (report.status === "approved") return "approved";
  return "yes";
}

export type ReviewVerdict = "yes" | "own_report" | "forbidden";

/**
 * May this member review the report? The Project's advisor, or a holder of
 * `reviewProjectReports`, but never the report's author, whatever they hold.
 */
export function reviewVerdict(facts: {
  actorId: string;
  canReview: boolean;
  advisorId: string | null;
  authorId: string;
}): ReviewVerdict {
  if (facts.actorId === facts.authorId) return "own_report";
  if (facts.canReview || facts.advisorId === facts.actorId) return "yes";
  return "forbidden";
}

export const REVIEW_REFUSAL: Record<Exclude<ReviewVerdict, "yes">, Refusal> = {
  own_report: "You cannot review your own report.",
  forbidden: "Only the project's advisor or a report reviewer can review this.",
};

// ── Repo links on create ────────────────────────────────────────────────────

/** A control check's outcome for one repo (`resolveControlledRepo`). */
export interface LinkControl {
  approval: "approved" | "pending";
  basis: "personal" | "devdogs-write" | "officer";
}

/**
 * The status a new Project takes from its repo links: active when at least
 * one is approved on the spot (a personal repo, or a DevDogsUGA repo the
 * member can write to), archived while every link waits on an officer.
 */
export function statusFromLinks(
  controls: readonly LinkControl[],
): ProjectStatus {
  return controls.some((c) => c.approval === "approved")
    ? "active"
    : "archived";
}
