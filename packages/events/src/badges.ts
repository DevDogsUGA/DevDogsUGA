import { z } from "zod";
import { SERIES_ID_PATTERN } from "./schema.js";
import type { WorkshopDefinition } from "./workshops.js";

/**
 * Badge definitions: the recognitions a member can hold, authored once in
 * `badges.json`. Awards (who holds what, when, on what evidence) live in the
 * database; this file only says which badges exist.
 *
 * `automatic` badges are awarded by the platform from evidence it already
 * holds; `manual` ones are awarded by an officer with a public citation.
 * `repeatable` badges may be awarded again (officer recognition, shown as a
 * multiplier); the rest are one-time achievements.
 *
 * `perWorkshop` expands one definition into one badge per workshop definition
 * (Workshop completed: Next.js, Workshop completed: Flutter). Its awards carry
 * the workshop's id beside the badge id.
 */

/** The longest public citation an officer can write. */
export const BADGE_CITATION_MAX_LENGTH = 280;

/** The longest reason an officer gives when withdrawing a badge. */
export const BADGE_WITHDRAWAL_REASON_MAX_LENGTH = 280;

/** The id the automatic workshop badge is stored under. */
export const WORKSHOP_COMPLETED_BADGE_ID = "workshop-completed";

/** The id of the automatic first-merged-pull-request badge. */
export const FIRST_MERGE_BADGE_ID = "first-merge";

export const badgeDefinitionSchema = z.strictObject({
  id: z.string().regex(SERIES_ID_PATTERN).meta({
    description:
      "The badge's identity; awards reference it. Never reuse an id.",
  }),
  name: z.string().min(1).max(60).meta({
    description:
      'What the badge is called. A per-workshop badge shows "<name>: <workshop title>".',
  }),
  description: z.string().min(1).max(280).meta({
    description: "What earning it means, in one or two sentences.",
  }),
  kind: z.enum(["automatic", "manual"]).meta({
    description:
      "Automatic badges are awarded by the platform; manual ones by an officer.",
  }),
  repeatable: z.boolean().meta({
    description:
      "True when it can be awarded again (shown as a multiplier); false for a one-time achievement.",
  }),
  perWorkshop: z.boolean().default(false).meta({
    description:
      "True when there is one badge per workshop definition rather than one overall.",
  }),
});

export type BadgeDefinition = z.infer<typeof badgeDefinitionSchema>;

export const badgesConfigSchema = z.strictObject({
  $schema: z.string().optional(),
  badges: z.array(badgeDefinitionSchema),
});

export type BadgesConfig = z.infer<typeof badgesConfigSchema>;

export interface BadgeIssue {
  id: string;
  message: string;
}

/** What `badges.json` cannot say in its shape alone. */
export function validateBadges(config: BadgesConfig): BadgeIssue[] {
  const issues: BadgeIssue[] = [];
  const seen = new Set<string>();
  for (const badge of config.badges) {
    if (seen.has(badge.id)) {
      issues.push({ id: badge.id, message: "Badge id is used twice." });
    }
    seen.add(badge.id);
    if (badge.perWorkshop && badge.repeatable) {
      issues.push({
        id: badge.id,
        message:
          "A per-workshop badge is awarded once per workshop, so it cannot be repeatable.",
      });
    }
  }
  for (const required of [WORKSHOP_COMPLETED_BADGE_ID, FIRST_MERGE_BADGE_ID]) {
    const badge = config.badges.find((b) => b.id === required);
    if (!badge) {
      issues.push({
        id: required,
        message: "The platform awards this badge, so it must be defined.",
      });
    } else if (badge.kind !== "automatic" || badge.repeatable) {
      issues.push({
        id: required,
        message: "This badge must be automatic and not repeatable.",
      });
    }
  }
  if (
    !config.badges.find((b) => b.id === WORKSHOP_COMPLETED_BADGE_ID)
      ?.perWorkshop
  ) {
    issues.push({
      id: WORKSHOP_COMPLETED_BADGE_ID,
      message: "Workshop completed must be per-workshop.",
    });
  }
  return issues;
}

/** One badge as a member can hold it: a definition plus, for per-workshop
 *  badges, the workshop it is for. */
export interface ResolvedBadge {
  /** The definition's id. */
  badgeId: string;
  workshopDefinitionId: string | null;
  /** "First Merge", or "Workshop completed: Next.js". */
  name: string;
  description: string;
  kind: "automatic" | "manual";
  repeatable: boolean;
}

/**
 * The display of a badge by its award's keys. Unknown badges (an id since
 * removed from config) and unknown workshops fall back to the raw ids, so an
 * old award still renders rather than vanishing.
 */
export function resolveBadge(
  config: BadgesConfig,
  workshops: readonly Pick<WorkshopDefinition, "id" | "title">[],
  badgeId: string,
  workshopDefinitionId: string | null,
): ResolvedBadge {
  const definition = config.badges.find((b) => b.id === badgeId);
  if (!definition) {
    return {
      badgeId,
      workshopDefinitionId,
      name: badgeId,
      description: "",
      kind: "manual",
      repeatable: true,
    };
  }
  const workshop = workshopDefinitionId
    ? (workshops.find((w) => w.id === workshopDefinitionId)?.title ??
      workshopDefinitionId)
    : null;
  return {
    badgeId,
    workshopDefinitionId,
    name: workshop ? `${definition.name}: ${workshop}` : definition.name,
    description: definition.description,
    kind: definition.kind,
    repeatable: definition.repeatable,
  };
}

/** Every badge that exists today: each plain definition once, each
 *  per-workshop one per workshop definition. */
export function allBadges(
  config: BadgesConfig,
  workshops: readonly Pick<WorkshopDefinition, "id" | "title">[],
): ResolvedBadge[] {
  return config.badges.flatMap((badge) =>
    badge.perWorkshop
      ? workshops.map((w) => resolveBadge(config, workshops, badge.id, w.id))
      : [resolveBadge(config, workshops, badge.id, null)],
  );
}
