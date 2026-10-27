import {
  resolveBadge,
  type BadgesConfig,
  type ResolvedBadge,
  type WorkshopDefinition,
} from "@devdogsuga/events";

/**
 * Turns a member's award rows into what a profile shows: one entry per badge
 * (per workshop, for Workshop completed), with a count and the dated awards
 * behind it. Pure, so the grouping and the "Deleted member" rule are tested
 * without a database.
 */

/** What shows when the officer who made an award has since deleted their account. */
export const DELETED_AWARDER_NAME = "Deleted member";

export interface AwardRow {
  id: string;
  badgeId: string;
  workshopDefinitionId: string | null;
  method: "automatic" | "manual";
  awardedAt: Date;
  /** The officer, or null for automatic awards and deleted officers. */
  awardedBy: string | null;
  /** Their preferred name while their account exists. */
  awardedByName: string | null;
  citation: string | null;
  withdrawnAt: Date | null;
  withdrawnReason: string | null;
  hidden: boolean;
}

export interface BadgeAwardView {
  id: string;
  awardedAt: Date;
  citation: string | null;
  /** Null for automatic awards (nobody awarded them). */
  awardedByLabel: string | null;
  withdrawnAt: Date | null;
  withdrawnReason: string | null;
  hidden: boolean;
}

export interface BadgeEntry extends ResolvedBadge {
  /** `badgeId` or `badgeId:workshopId`; stable, for React keys and forms. */
  key: string;
  /** Live awards (not withdrawn). The ×N multiplier when above one. */
  count: number;
  /** True when every live award is hidden by the member. */
  hidden: boolean;
  /** Newest first. Live awards, then withdrawn ones when requested. */
  awards: BadgeAwardView[];
  latestAwardedAt: Date;
}

export function badgeKey(
  badgeId: string,
  workshopDefinitionId: string | null,
): string {
  return workshopDefinitionId ? `${badgeId}:${workshopDefinitionId}` : badgeId;
}

export function awardedByLabel(row: AwardRow): string | null {
  if (row.method === "automatic") return null;
  return row.awardedBy && row.awardedByName
    ? row.awardedByName
    : DELETED_AWARDER_NAME;
}

export function groupAwards(
  rows: readonly AwardRow[],
  config: BadgesConfig,
  workshops: readonly Pick<WorkshopDefinition, "id" | "title">[],
  options: { includeWithdrawn?: boolean; includeHidden?: boolean } = {},
): BadgeEntry[] {
  const groups = new Map<string, AwardRow[]>();
  for (const row of rows) {
    if (row.withdrawnAt && !options.includeWithdrawn) continue;
    const key = badgeKey(row.badgeId, row.workshopDefinitionId);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const entries: BadgeEntry[] = [];
  for (const [key, group] of groups) {
    const first = group[0]!;
    const sorted = [...group].sort(
      (a, b) => b.awardedAt.getTime() - a.awardedAt.getTime(),
    );
    const live = sorted.filter((row) => !row.withdrawnAt);
    const hidden = live.length > 0 && live.every((row) => row.hidden);
    if (hidden && !options.includeHidden) continue;
    entries.push({
      ...resolveBadge(
        config,
        workshops,
        first.badgeId,
        first.workshopDefinitionId,
      ),
      key,
      count: live.length,
      hidden,
      latestAwardedAt: sorted[0]!.awardedAt,
      awards: sorted.map((row) => ({
        id: row.id,
        awardedAt: row.awardedAt,
        // A hidden badge hides its citation with it (Q107).
        citation: row.hidden && !options.includeHidden ? null : row.citation,
        awardedByLabel: awardedByLabel(row),
        withdrawnAt: row.withdrawnAt,
        withdrawnReason: row.withdrawnReason,
        hidden: row.hidden,
      })),
    });
  }
  return entries.sort(
    (a, b) =>
      b.latestAwardedAt.getTime() - a.latestAwardedAt.getTime() ||
      a.name.localeCompare(b.name),
  );
}

/** "×3" for a repeated badge, null for a single award. */
export function multiplierLabel(
  entry: Pick<BadgeEntry, "count">,
): string | null {
  return entry.count > 1 ? `×${entry.count}` : null;
}
