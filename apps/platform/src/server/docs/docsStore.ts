import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ExpectedFailure } from "~/lib/actionResult";
import { db } from "~/server/db";
import {
  auditEvents,
  projectDocsProposals,
  projectRepoDetails,
  projects,
} from "~/server/db/schema";
import type {
  DocsRepoRow,
  DocsStore,
  ProposalRow,
  ProposalState,
} from "./docsProposals";

/**
 * The database half of the docs proposals (`docsProposals.ts`): plain reads
 * and writes of `platform.projects` and `platform."projectDocsProposals"`, with
 * the transaction boundaries the rules rely on. Proved against Postgres in
 * `docsStore.db-test.ts`.
 */

const IN_FLIGHT: ProposalState[] = ["opening", "open"];
const ERROR_MAX = 500;

type Database = typeof db;

function toRow(row: typeof projectDocsProposals.$inferSelect): ProposalRow {
  return {
    id: row.id,
    projectId: row.projectId,
    requestedBy: row.requestedBy,
    enable: row.enable,
    githubRepoId: String(row.githubRepoId),
    ownerId: String(row.ownerId),
    slug: row.slug,
    prNumber: row.prNumber,
    prUrl: row.prUrl,
    state: row.state as ProposalState,
    createdAt: row.createdAt,
  };
}

export function createDocsStore(database: Database = db): DocsStore {
  return {
    async loadProject(projectId) {
      const [project] = await database
        .select({
          id: projects.id,
          name: projects.name,
          slug: projects.slug,
          docsRepoId: projects.docsRepoId,
          docsRequested: projects.docsRequested,
          docsPausedAt: projects.docsPausedAt,
          docsFirstPublishedAt: projects.docsFirstPublishedAt,
        })
        .from(projects)
        .where(eq(projects.id, projectId));
      if (!project) return null;
      const links = await database
        .select({
          githubRepoId: projectRepoDetails.githubRepoId,
          ownerId: projectRepoDetails.ownerId,
          owner: projectRepoDetails.owner,
          name: projectRepoDetails.name,
          approval: projectRepoDetails.approval,
          health: projectRepoDetails.health,
        })
        .from(projectRepoDetails)
        .where(eq(projectRepoDetails.projectId, projectId))
        .orderBy(asc(projectRepoDetails.linkedAt));
      const repos: DocsRepoRow[] = links.map((link) => ({
        githubRepoId: String(link.githubRepoId),
        ownerId: String(link.ownerId),
        owner: link.owner,
        name: link.name,
        approved: link.approval === "approved",
        available: link.health === "available",
      }));
      return {
        project: {
          ...project,
          docsRepoId:
            project.docsRepoId === null ? null : String(project.docsRepoId),
        },
        repos,
      };
    },

    async activeProposal(projectId) {
      const [row] = await database
        .select()
        .from(projectDocsProposals)
        .where(
          and(
            eq(projectDocsProposals.projectId, projectId),
            inArray(projectDocsProposals.state, IN_FLIGHT),
          ),
        );
      return row ? toRow(row) : null;
    },

    async beginProposal(proposal) {
      await database.transaction(async (tx) => {
        // Serializes this project's proposals and its repository choice.
        await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, proposal.projectId))
          .for("update");
        const [mine] = await tx
          .select({ state: projectDocsProposals.state })
          .from(projectDocsProposals)
          .where(eq(projectDocsProposals.id, proposal.id));
        if (mine) {
          if (mine.state !== "opening")
            throw new ExpectedFailure(
              "That docs pull request has already been opened.",
            );
          await tx
            .update(projectDocsProposals)
            .set({ baseSha: proposal.baseSha, updatedAt: new Date() })
            .where(eq(projectDocsProposals.id, proposal.id));
        } else {
          const [other] = await tx
            .select({ id: projectDocsProposals.id })
            .from(projectDocsProposals)
            .where(
              and(
                eq(projectDocsProposals.projectId, proposal.projectId),
                inArray(projectDocsProposals.state, IN_FLIGHT),
              ),
            );
          if (other)
            throw new ExpectedFailure(
              "A docs pull request for this project is already being opened.",
            );
          await tx.insert(projectDocsProposals).values({
            id: proposal.id,
            projectId: proposal.projectId,
            requestedBy: proposal.requestedBy,
            enable: proposal.enable,
            githubRepoId: BigInt(proposal.githubRepoId),
            ownerId: BigInt(proposal.ownerId),
            slug: proposal.slug,
            baseSha: proposal.baseSha,
            state: "opening",
          });
        }
        // The owner-change pause is keyed by the project's docs repository, so
        // a project whose docs repository was "its only repository" has to
        // record that choice before docs can be turned on.
        if (proposal.enable) {
          await tx
            .update(projects)
            .set({
              docsRepoId: BigInt(proposal.githubRepoId),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(projects.id, proposal.projectId),
                sql`${projects.docsRepoId} is null`,
              ),
            );
        }
      });
    },

    async markOpen(id, pull) {
      await database
        .update(projectDocsProposals)
        .set({
          state: "open",
          prNumber: pull.number,
          prUrl: pull.url,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectDocsProposals.id, id),
            inArray(projectDocsProposals.state, IN_FLIGHT),
          ),
        );
    },

    async noteError(id, message) {
      await database
        .update(projectDocsProposals)
        .set({ lastError: message.slice(0, ERROR_MAX), updatedAt: new Date() })
        .where(
          and(
            eq(projectDocsProposals.id, id),
            eq(projectDocsProposals.state, "opening"),
          ),
        );
    },

    async markFailed(id, message) {
      await database
        .update(projectDocsProposals)
        .set({
          state: "failed",
          lastError: message.slice(0, ERROR_MAX),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectDocsProposals.id, id),
            inArray(projectDocsProposals.state, IN_FLIGHT),
          ),
        );
    },

    async setRequested(projectId, requested, githubRepoId) {
      await database.transaction(async (tx) => {
        await tx
          .update(projects)
          .set({ docsRequested: requested, updatedAt: new Date() })
          .where(eq(projects.id, projectId));
        if (requested) {
          await tx
            .update(projects)
            .set({ docsRepoId: BigInt(githubRepoId) })
            .where(
              and(
                eq(projects.id, projectId),
                sql`${projects.docsRepoId} is null`,
              ),
            );
        }
      });
    },

    async inFlight(limit) {
      const rows = await database
        .select()
        .from(projectDocsProposals)
        .where(inArray(projectDocsProposals.state, IN_FLIGHT))
        .orderBy(asc(projectDocsProposals.createdAt))
        .limit(limit);
      return rows.map(toRow);
    },

    async settleMerged(proposal) {
      await database.transaction(async (tx) => {
        const settled = await tx
          .update(projectDocsProposals)
          .set({ state: "merged", updatedAt: new Date() })
          .where(
            and(
              eq(projectDocsProposals.id, proposal.id),
              inArray(projectDocsProposals.state, IN_FLIGHT),
            ),
          )
          .returning({ id: projectDocsProposals.id });
        // Another run already settled it.
        if (settled.length === 0) return;

        if (proposal.enable) {
          // The map now confirms this owner. The pause lifts only if the
          // repository still has that owner: a second transfer while the
          // pull request waited keeps it paused.
          await tx.execute(sql`
            update platform.projects p set
              "docsRequested" = true,
              "docsConfirmedOwnerId" = ${proposal.ownerId}::bigint,
              "docsConfirmedBy" = ${proposal.requestedBy}::uuid,
              "docsConfirmedAt" = now(),
              "docsPausedAt" = case when exists (
                select 1 from platform."githubRepos" r
                where r."githubRepoId" = ${proposal.githubRepoId}::bigint
                  and r."ownerId" = ${proposal.ownerId}::bigint
              ) then null else p."docsPausedAt" end,
              "docsPauseReason" = case when exists (
                select 1 from platform."githubRepos" r
                where r."githubRepoId" = ${proposal.githubRepoId}::bigint
                  and r."ownerId" = ${proposal.ownerId}::bigint
              ) then null else p."docsPauseReason" end,
              "updatedAt" = now()
            where p.id = ${proposal.projectId}::uuid`);
        } else {
          await tx
            .update(projects)
            .set({ docsRequested: false, updatedAt: new Date() })
            .where(eq(projects.id, proposal.projectId));
        }
        await tx.insert(auditEvents).values({
          actorType: "system",
          source: "platform",
          action: "project.docs_pr_merged",
          targetType: "project",
          targetId: proposal.projectId,
          metadata: {
            slug: proposal.slug,
            enable: proposal.enable,
            number: proposal.prNumber,
          },
        });
      });
    },

    async settleClosed(proposal) {
      await database
        .update(projectDocsProposals)
        .set({ state: "closed", updatedAt: new Date() })
        .where(
          and(
            eq(projectDocsProposals.id, proposal.id),
            inArray(projectDocsProposals.state, IN_FLIGHT),
          ),
        );
    },

    async markPublished(slug, at) {
      const rows = await database
        .update(projects)
        .set({ docsFirstPublishedAt: at, updatedAt: new Date() })
        .where(
          and(
            eq(projects.slug, slug),
            eq(projects.docsRequested, true),
            sql`${projects.docsFirstPublishedAt} is null`,
          ),
        )
        .returning({ id: projects.id });
      return rows.length > 0;
    },

    async audit(entry) {
      await database.insert(auditEvents).values({
        actorType: "user",
        actorUserId: entry.actorId,
        source: "platform",
        action: "project.docs_pr_opened",
        targetType: "project",
        targetId: entry.projectId,
        metadata: {
          slug: entry.slug,
          change: entry.change,
          url: entry.url,
          number: entry.number,
          branch: entry.branch,
          staging: entry.staging,
        },
      });
    },
  };
}
