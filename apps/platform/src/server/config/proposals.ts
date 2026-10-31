import { rules, loadCaller } from "~/server/auth/access";
import { getAuthoredFiles, validateConfigFiles } from "@devdogsuga/events";
import { sql } from "drizzle-orm";
import { env } from "~/env";

import { db } from "~/server/db";
import { auditEvents, profiles } from "~/server/db/schema";
import { consumeRateLimit } from "~/server/rateLimit";
import { eq } from "drizzle-orm";
import {
  applyEdits,
  diffConfig,
  effectiveEdits,
  type AuthoredConfig,
  type ItemChange,
  type Orphan,
  type SavedEdit,
} from "./edits";
import { listEdits } from "./editsStore";
import {
  openProposal,
  plainName,
  type Officer,
  type ProposalResult,
} from "./githubProposal";

/**
 * The officer's proposal, from what they saved to a pull request.
 *
 * `previewProposal` is what the editor shows: the official config as deployed,
 * the officer's saved edits laid over it, the diff, and whether the result
 * would pass the events validator. `openConfigPr` is the button: it re-checks
 * the officer, refuses a proposal that fails validation before touching GitHub,
 * and writes an audit row for every pull request it opens.
 */

export const CONFIG_REPO = "DevDogsUGA";

/** True when the config-PR App's credentials are set in this environment. */
export function configPrsAvailable(): boolean {
  return Boolean(env.GH_CONFIG_APP_ID && env.GH_CONFIG_APP_PRIVATE_KEY);
}

/** Staging and local runs open draft PRs labelled `staging`; only production opens a real one. */
export function isStagingPr(): boolean {
  return process.env.DEPLOY_ENV !== "production";
}

export interface ProposalPreview {
  edits: SavedEdit[];
  orphans: Orphan[];
  changes: ItemChange[];
  validation: { ok: true } | { ok: false; errors: string[] };
}

/** Pure part of the preview, over given files and edits. */
export function buildPreview(
  official: AuthoredConfig,
  saved: readonly SavedEdit[],
): ProposalPreview {
  const edits = effectiveEdits(official, saved);
  const { files, orphans } = applyEdits(official, edits);
  const proposed = { ...official, ...files };
  return {
    edits,
    orphans,
    changes: diffConfig(official, proposed),
    validation: validateConfigFiles(proposed),
  };
}

export async function previewProposal(
  userId: string,
): Promise<ProposalPreview> {
  const official = getAuthoredFiles() as unknown as AuthoredConfig;
  return buildPreview(official, await listEdits(userId));
}

export type OpenResult =
  | Extract<
      ProposalResult,
      { status: "opened" | "invalid" | "nothing_to_propose" | "github_error" }
    >
  | { status: "forbidden" }
  | { status: "unavailable" }
  | { status: "rate_limited" };

/**
 * Who the commit credits. GitHub credits a co-author by email, so a member who
 * linked GitHub gets their noreply address; everyone else gets a placeholder
 * on the club's domain. Never the member's school address: a commit is public.
 */
export async function officerIdentity(userId: string): Promise<Officer> {
  const [profile] = await db
    .select({ name: profiles.preferredName })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const rows = await db.execute<{ id: string; login: string | null }>(sql`
    select i.provider_id as "id", i.identity_data->>'user_name' as "login"
    from auth.identities i
    where i.user_id = ${userId}::uuid and i.provider = 'github'
    limit 1
  `);
  const github = rows[0];
  return {
    name: plainName(profile?.name ?? ""),
    email: github?.login
      ? `${github.id}+${github.login}@users.noreply.github.com`
      : "noreply@devdogsuga.org",
  };
}

const PRS_PER_HOUR = 3;

export async function openConfigPr(
  userId: string,
  options: { fetch?: typeof fetch } = {},
): Promise<OpenResult> {
  if (
    !(await loadCaller().then(
      (caller) =>
        caller !== null && caller.userId === userId && rules.officer(caller),
    ))
  )
    return { status: "forbidden" };
  if (!configPrsAvailable()) return { status: "unavailable" };

  // The local check first: a proposal that cannot validate never reaches GitHub.
  const preview = await previewProposal(userId);
  if (!preview.validation.ok) {
    return { status: "invalid", errors: preview.validation.errors };
  }
  if (preview.changes.length === 0) return { status: "nothing_to_propose" };

  if (
    !(await consumeRateLimit({
      scope: "config:pr",
      subjectId: userId,
      limit: PRS_PER_HOUR,
      windowSeconds: 3600,
    }))
  ) {
    return { status: "rate_limited" };
  }

  const staging = isStagingPr();
  const result = await openProposal({
    credentials: {
      appId: env.GH_CONFIG_APP_ID!,
      privateKey: env.GH_CONFIG_APP_PRIVATE_KEY!,
    },
    repo: { owner: env.GITHUB_ORG, name: CONFIG_REPO },
    edits: preview.edits,
    officer: await officerIdentity(userId),
    staging,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  if (result.status === "opened") {
    try {
      await db.insert(auditEvents).values({
        actorType: "user",
        actorUserId: userId,
        source: "platform",
        action: "config.pr_opened",
        targetType: "configProposal",
        targetId: `${env.GITHUB_ORG}/${CONFIG_REPO}#${result.number}`,
        metadata: {
          url: result.url,
          branch: result.branch,
          draft: result.draft,
          staging,
          files: result.files,
          items: result.changes.map((c) => `${c.collection}:${c.key}`),
        },
      });
    } catch (error) {
      // The pull request exists on GitHub either way; losing the audit row
      // must not hide that from the officer. Reported, not swallowed.
      console.error("config.pr_opened audit row failed", error);
    }
  }
  return result;
}
