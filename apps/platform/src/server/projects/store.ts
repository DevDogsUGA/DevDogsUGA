import { and, eq, sql } from "drizzle-orm";

import {
  expected,
  ExpectedFailure,
  type ActionResult,
} from "~/lib/actionResult";
import { rules, type Caller } from "~/server/auth/access";
import { db } from "~/server/db";
import { projectOwners, projects } from "~/server/db/schema";
import { resolveControlledRepo } from "~/server/github/control";
import { saveRepo } from "~/server/github/store";
import { guardMessage, isUniqueViolationOf } from "./dbErrors";
import {
  normalizeProjectName,
  parseRepos,
  parseTags,
  PROJECT_MAX_REPOS,
  projectTextProblem,
} from "./policy";
import {
  archiveBlock,
  deleteBlock,
  linkBlock,
  mayEdit,
  mayManageOwners,
  officerBlock,
  statusFromLinks,
  unarchiveBlock,
  unlinkBlock,
  type LinkFacts,
  type ProjectFacts,
  type RecordActor,
} from "./records";
import { projectSlug, slugBase } from "./slug";
import { audit, type Tx } from "./tx";

/**
 * Writes for Projects: creation, edits, repo links, Owners, lifecycle and the
 * officer-only actions. Domain code, not actions: it returns Action results,
 * applies the Record rules in `records.ts` to facts read inside the
 * transaction, and writes an audit row with every change. The server actions
 * authorize through the Access module first and revalidate afterwards.
 *
 * Refusals a member can cause are thrown as `ExpectedFailure` and returned as
 * `{ ok: false }` by `expected()`; only bugs escape.
 */

const actorOf = (caller: Caller): RecordActor => ({
  userId: caller.userId,
  isOfficer: rules.officer(caller),
});

const NOT_FOUND = "That project was not found.";

function refuse(message: string, fieldErrors?: Record<string, string>): never {
  throw new ExpectedFailure(message, fieldErrors);
}

/** A DB guard the pre-checks missed, in the member's words; otherwise a bug. */
function rethrowGuard(error: unknown): never {
  const message = guardMessage(error);
  if (message) refuse(message);
  throw error;
}

type Locked = ProjectFacts & { id: string; name: string; slug: string };

/** The project row, locked for the transaction, with its owners; or a refusal. */
async function lockProject(tx: Tx, projectId: string): Promise<Locked> {
  const [row] = await tx
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      status: projects.status,
      devdogsOwned: projects.devdogsOwned,
      advisorId: projects.advisorId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for("update");
  if (!row) refuse(NOT_FOUND);
  const owners = await tx
    .select({ userId: projectOwners.userId })
    .from(projectOwners)
    .where(eq(projectOwners.projectId, projectId));
  return { ...row, ownerIds: owners.map((o) => o.userId) };
}

async function linksOf(tx: Tx, projectId: string): Promise<LinkFacts[]> {
  return tx.execute<LinkFacts>(sql`
    select "githubRepoId"::text as "githubRepoId", approval
    from platform."projectRepos" where "projectId" = ${projectId}::uuid`);
}

async function memberExists(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.execute(
    sql`select 1 from auth.users where id = ${userId}::uuid for share`,
  );
  return rows.length > 0;
}

/** Members who have linked GitHub: the pool Owners are chosen from. */
async function hasLinkedGithub(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.execute(sql`
    select 1 from auth.identities
    where provider = 'github' and user_id = ${userId}::uuid limit 1`);
  return rows.length > 0;
}

type Resolved = Extract<
  Awaited<ReturnType<typeof resolveControlledRepo>>,
  { ok: true }
>["data"];

/** The control check (Q41) for one typed repo, refused with the repo's name on it. */
async function controlled(userId: string, typed: string): Promise<Resolved> {
  const found = await resolveControlledRepo(userId, typed);
  if (!found.ok) {
    const message = `${typed}: ${found.message}.`.replace(/\.\.$/u, ".");
    refuse(message, { repos: message });
  }
  return found.data;
}

async function insertLink(
  tx: Tx,
  projectId: string,
  userId: string,
  link: Resolved,
) {
  const approved = link.approval === "approved";
  await tx.execute(sql`
    insert into platform."projectRepos"
      ("projectId", "githubRepoId", "linkedBy", approval, "approvalBasis", "decidedAt", "approvalOwnerId")
    values (${projectId}::uuid, ${String(link.repo.id)}::bigint, ${userId}::uuid,
      ${link.approval}, ${link.basis},
      ${approved ? sql`now()` : sql`null`}, ${String(link.repo.owner.id)}::bigint)`);
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreateProjectInput {
  name: string;
  description: string;
  /** Comma- or line-separated, as typed. */
  tags: string;
  /** `owner/name` per line or comma-separated, as typed; at least one. */
  repos: string;
}

export interface CreatedProject {
  projectId: string;
  slug: string;
  /** Archived while every repo waits on an officer. */
  status: "active" | "archived";
  /** Repos that wait on an officer's approval. */
  pending: number;
}

/**
 * A member creates a Project (Q25): name, description, tags and at least one
 * repo, each proved through `resolveControlledRepo`. A personal repo, or a
 * DevDogsUGA repo the member can write to, is approved on the spot. A repo in
 * any other organization is a pending link, and while every link is pending
 * the Project stays archived until an officer approves one. The creator is
 * the first Owner.
 */
export function createProject(
  actor: Caller,
  input: CreateProjectInput,
): Promise<ActionResult<CreatedProject>> {
  return expected(async () => {
    const name = normalizeProjectName(input.name);
    const description = input.description.trim();
    const text = projectTextProblem(name, description);
    if (text) refuse(text.message, { [text.field]: text.message });
    const tags = parseTags(input.tags);
    if (!tags.ok) refuse(tags.message, { tags: tags.message });
    const typed = parseRepos(input.repos);
    if (!typed.ok) refuse(typed.message, { repos: typed.message });
    if (typed.repos.length === 0) {
      const message = "Link at least one GitHub repository.";
      refuse(message, { repos: message });
    }

    // One check per repo, before any write. The same repo typed under two
    // names resolves to one id and links once.
    const links: Resolved[] = [];
    for (const repo of typed.repos) {
      const link = await controlled(actor.userId, repo);
      if (!links.some((l) => l.repo.id === link.repo.id)) links.push(link);
    }
    for (const link of links) await saveRepo(link.repo);
    const status = statusFromLinks(links);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await db.transaction(async (tx) => {
          const base = slugBase(name);
          const rows = await tx.execute<{ slug: string }>(
            sql`select slug from platform.projects where slug like ${`${base}%`}`,
          );
          const slug = projectSlug(name, new Set(rows.map((r) => r.slug)));
          const [created] = await tx
            .insert(projects)
            .values({
              name,
              description: description === "" ? null : description,
              slug,
              tags: tags.tags,
              status,
            })
            .returning({ id: projects.id });
          if (!created) throw new Error("Project was not created.");
          await tx.insert(projectOwners).values({
            projectId: created.id,
            userId: actor.userId,
            addedBy: actor.userId,
          });
          for (const link of links)
            await insertLink(tx, created.id, actor.userId, link);
          await audit(
            tx,
            actor.userId,
            "project.created",
            "project",
            created.id,
            {
              name,
              slug,
              status,
              repos: links.map((l) => `${l.repo.owner.login}/${l.repo.name}`),
            },
          );
          return {
            projectId: created.id,
            slug,
            status,
            pending: links.filter((l) => l.approval === "pending").length,
          };
        });
      } catch (error) {
        if (isUniqueViolationOf(error, "projects_name_key")) {
          const message = "A project with that name already exists.";
          refuse(message, { name: message });
        }
        // Another project took the slug between the read and the insert.
        if (isUniqueViolationOf(error, "projects_slug_key")) continue;
        rethrowGuard(error);
      }
    }
    return refuse(
      "Could not pick a unique address for the project. Try again.",
    );
  });
}

// ── Edit ────────────────────────────────────────────────────────────────────

export interface UpdateProjectInput {
  name: string;
  description: string;
  tags: string;
}

/** Owners edit the name, description and tags; so do Officers on a DevDogs-owned Project. */
export function updateProject(
  actor: Caller,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ActionResult<void>> {
  return expected(async () => {
    const name = normalizeProjectName(input.name);
    const description = input.description.trim();
    const text = projectTextProblem(name, description);
    if (text) refuse(text.message, { [text.field]: text.message });
    const tags = parseTags(input.tags);
    if (!tags.ok) refuse(tags.message, { tags: tags.message });
    try {
      await db.transaction(async (tx) => {
        const project = await lockProject(tx, projectId);
        if (!mayEdit(project, actorOf(actor)))
          refuse("Only a project owner can edit it.");
        await tx
          .update(projects)
          .set({
            name,
            description: description === "" ? null : description,
            tags: tags.tags,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId));
        await audit(tx, actor.userId, "project.updated", "project", projectId, {
          from: project.name,
          to: name,
        });
      });
    } catch (error) {
      if (isUniqueViolationOf(error, "projects_name_key")) {
        const message = "A project with that name already exists.";
        refuse(message, { name: message });
      }
      rethrowGuard(error);
    }
  }, "Project saved.");
}

// ── Repos ───────────────────────────────────────────────────────────────────

/**
 * Link one more repo (at most 10). The member proves control the same way as
 * on creation. A pending link confers nothing until an officer approves it.
 */
export function linkRepo(
  actor: Caller,
  projectId: string,
  typed: string,
): Promise<ActionResult<{ approval: "approved" | "pending" }>> {
  return expected(async () => {
    const parsed = parseRepos(typed);
    if (!parsed.ok) refuse(parsed.message, { repo: parsed.message });
    const [name] = parsed.repos;
    if (parsed.repos.length !== 1 || !name) {
      const message = "Enter one repository as owner/name.";
      refuse(message, { repo: message });
    }
    // Check access first so a stranger cannot spend GitHub requests.
    await db.transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      if (!mayEdit(project, actorOf(actor)))
        refuse("Only a project owner can link repositories.");
    });
    const link = await controlled(actor.userId, name).catch((error) => {
      if (error instanceof ExpectedFailure)
        throw new ExpectedFailure(error.message, { repo: error.message });
      throw error;
    });
    await saveRepo(link.repo);
    try {
      await db.transaction(async (tx) => {
        const project = await lockProject(tx, projectId);
        if (!mayEdit(project, actorOf(actor)))
          refuse("Only a project owner can link repositories.");
        const blocked = linkBlock(
          await linksOf(tx, projectId),
          String(link.repo.id),
          PROJECT_MAX_REPOS,
        );
        if (blocked) refuse(blocked, { repo: blocked });
        await insertLink(tx, projectId, actor.userId, link);
        await audit(
          tx,
          actor.userId,
          "project.repo_linked",
          "project",
          projectId,
          {
            repo: `${link.repo.owner.login}/${link.repo.name}`,
            githubRepoId: String(link.repo.id),
            approval: link.approval,
            basis: link.basis,
          },
        );
      });
    } catch (error) {
      rethrowGuard(error);
    }
    return { approval: link.approval };
  });
}

/** Unlink a repo, unless it is the last or reports cite commits from it. */
export function unlinkRepo(
  actor: Caller,
  projectId: string,
  githubRepoId: string,
): Promise<ActionResult<void>> {
  return expected(async () => {
    try {
      await db.transaction(async (tx) => {
        const project = await lockProject(tx, projectId);
        if (!mayEdit(project, actorOf(actor)))
          refuse("Only a project owner can unlink repositories.");
        const cited = await tx.execute<{ id: string }>(sql`
          select distinct pc."githubRepoId"::text as id
          from platform."projectReportCommits" pc
          join platform."projectReports" r on r.id = pc."reportId"
          where r."projectId" = ${projectId}::uuid`);
        const blocked = unlinkBlock(
          project,
          await linksOf(tx, projectId),
          githubRepoId,
          new Set(cited.map((c) => c.id)),
        );
        if (blocked) refuse(blocked);
        await tx.execute(sql`
          delete from platform."projectRepos"
          where "projectId" = ${projectId}::uuid and "githubRepoId" = ${githubRepoId}::bigint`);
        await audit(
          tx,
          actor.userId,
          "project.repo_unlinked",
          "project",
          projectId,
          {
            githubRepoId,
          },
        );
      });
    } catch (error) {
      rethrowGuard(error);
    }
  }, "Repository unlinked.");
}

// ── Owners ──────────────────────────────────────────────────────────────────

/**
 * Add a co-owner, chosen from members with a linked GitHub account. Owners
 * add them, and Officers on any Project; for an orphan (no Owners left) that
 * is how an Officer resolves it.
 */
export function addOwner(
  actor: Caller,
  projectId: string,
  userId: string,
): Promise<ActionResult<void>> {
  return expected(async () => {
    await db.transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      if (!mayManageOwners(project, actorOf(actor)))
        refuse("Only a project owner or an officer can add owners.");
      if (!(await memberExists(tx, userId)))
        refuse("That member was not found.");
      if (!(await hasLinkedGithub(tx, userId)))
        refuse("Owners are chosen from members who have linked GitHub.");
      if (project.ownerIds.includes(userId))
        refuse("That member is already an owner.");
      await tx
        .insert(projectOwners)
        .values({ projectId, userId, addedBy: actor.userId });
      await audit(
        tx,
        actor.userId,
        "project.owner_added",
        "project",
        projectId,
        {
          userId,
        },
      );
    });
  }, "Owner added.");
}

/**
 * Remove an Owner. A Project keeps at least one unless it is DevDogs-owned,
 * where Officers are the Owners; an Officer resolves any orphan by adding one.
 */
export function removeOwner(
  actor: Caller,
  projectId: string,
  userId: string,
): Promise<ActionResult<void>> {
  return expected(async () => {
    await db.transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      if (!mayManageOwners(project, actorOf(actor)))
        refuse("Only a project owner or an officer can remove owners.");
      if (!project.ownerIds.includes(userId))
        refuse("That member is not an owner.");
      if (project.ownerIds.length <= 1 && !project.devdogsOwned)
        refuse("A project keeps at least one owner. Add another owner first.");
      await tx
        .delete(projectOwners)
        .where(
          and(
            eq(projectOwners.projectId, projectId),
            eq(projectOwners.userId, userId),
          ),
        );
      await audit(
        tx,
        actor.userId,
        "project.owner_removed",
        "project",
        projectId,
        {
          userId,
        },
      );
    });
  }, "Owner removed.");
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

/** Owners archive (Q24); officers do on a DevDogs-owned Project. */
export function archiveProject(
  actor: Caller,
  projectId: string,
): Promise<ActionResult<void>> {
  return expected(async () => {
    await db.transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      const blocked = archiveBlock(project, actorOf(actor));
      if (blocked) refuse(blocked);
      await tx
        .update(projects)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      await audit(
        tx,
        actor.userId,
        "project.archived",
        "project",
        projectId,
        {},
      );
    });
  }, "Project archived.");
}

/** Owners or Officers un-archive, once at least one repo link is approved. */
export function unarchiveProject(
  actor: Caller,
  projectId: string,
): Promise<ActionResult<void>> {
  return expected(async () => {
    await db.transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      const links = await linksOf(tx, projectId);
      const blocked = unarchiveBlock(
        project,
        actorOf(actor),
        links.filter((l) => l.approval === "approved").length,
      );
      if (blocked) refuse(blocked);
      await tx
        .update(projects)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      await audit(
        tx,
        actor.userId,
        "project.unarchived",
        "project",
        projectId,
        {},
      );
    });
  }, "Project restored.");
}

/** Delete a Project that has no reports and no submissions, and is not DevDogs-owned. */
export function deleteProject(
  actor: Caller,
  projectId: string,
): Promise<ActionResult<void>> {
  return expected(async () => {
    try {
      await db.transaction(async (tx) => {
        const project = await lockProject(tx, projectId);
        const [counts] = await tx.execute<{
          reports: string;
          submissions: string;
        }>(sql`
          select
            (select count(*) from platform."projectReports" where "projectId" = ${projectId}::uuid)::text as reports,
            (select count(*) from platform.submissions where "projectId" = ${projectId}::uuid)::text as submissions`);
        const blocked = deleteBlock(project, actorOf(actor), {
          reports: Number(counts?.reports ?? 0),
          submissions: Number(counts?.submissions ?? 0),
        });
        if (blocked) refuse(blocked);
        await audit(tx, actor.userId, "project.deleted", "project", projectId, {
          name: project.name,
          slug: project.slug,
        });
        await tx.delete(projects).where(eq(projects.id, projectId));
      });
    } catch (error) {
      rethrowGuard(error);
    }
  }, "Project deleted.");
}

// ── Officer-only ────────────────────────────────────────────────────────────

/**
 * An Officer approves or declines a pending link to a repo in another
 * organization. Approval does not reopen an archived Project: its Owners do
 * that, which keeps un-archiving one action.
 */
export function decideRepoLink(
  actor: Caller,
  projectId: string,
  githubRepoId: string,
  decision: "approve" | "decline",
): Promise<ActionResult<void>> {
  return expected(
    async () => {
      const officer = officerBlock(actorOf(actor));
      if (officer) refuse(officer);
      await db.transaction(async (tx) => {
        await lockProject(tx, projectId);
        const [link] = await tx.execute<{ approval: string }>(sql`
        select approval from platform."projectRepos"
        where "projectId" = ${projectId}::uuid and "githubRepoId" = ${githubRepoId}::bigint
        for update`);
        if (!link) refuse("That repository is not linked to this project.");
        if (link.approval !== "pending")
          refuse("That link was already decided.");
        const approval = decision === "approve" ? "approved" : "declined";
        await tx.execute(sql`
        update platform."projectRepos"
        set approval = ${approval}, "approvedBy" = ${actor.userId}::uuid, "decidedAt" = now()
        where "projectId" = ${projectId}::uuid and "githubRepoId" = ${githubRepoId}::bigint`);
        await audit(
          tx,
          actor.userId,
          `project.repo_${approval}`,
          "project",
          projectId,
          {
            githubRepoId,
          },
        );
      });
    },
    decision === "approve" ? "Repository approved." : "Repository declined.",
  );
}

/** An Officer names, replaces or clears the Project's advisor (Q49). */
export function setAdvisor(
  actor: Caller,
  projectId: string,
  advisorId: string | null,
): Promise<ActionResult<void>> {
  return expected(async () => {
    const officer = officerBlock(actorOf(actor));
    if (officer) refuse(officer);
    await db.transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      if (advisorId !== null && !(await memberExists(tx, advisorId)))
        refuse("Choose a member as the advisor.");
      await tx
        .update(projects)
        .set({ advisorId, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      await audit(
        tx,
        actor.userId,
        "project.advisor_set",
        "project",
        projectId,
        {
          from: project.advisorId,
          to: advisorId,
        },
      );
    });
  }, "Advisor saved.");
}

/**
 * An Officer takes a Project over (Q54). It cannot be undone and the Project
 * can no longer be deleted. Officers are its Owners by the Record rule, not by
 * rows, so no owner rows change.
 */
export function makeDevdogsOwned(
  actor: Caller,
  projectId: string,
): Promise<ActionResult<void>> {
  return expected(async () => {
    const officer = officerBlock(actorOf(actor));
    if (officer) refuse(officer);
    try {
      await db.transaction(async (tx) => {
        const project = await lockProject(tx, projectId);
        if (project.devdogsOwned)
          refuse("That project is already DevDogs-owned.");
        await tx
          .update(projects)
          .set({ devdogsOwned: true, updatedAt: new Date() })
          .where(eq(projects.id, projectId));
        await audit(
          tx,
          actor.userId,
          "project.devdogs_owned",
          "project",
          projectId,
          {},
        );
      });
    } catch (error) {
      rethrowGuard(error);
    }
  }, "Project is now DevDogs-owned.");
}
