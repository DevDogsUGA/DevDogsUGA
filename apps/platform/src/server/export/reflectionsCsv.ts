import { csvTimestamp } from "./csv";

/**
 * The CSV shape for `/export/reflections`, split from `reflections.ts` so it
 * can be unit-tested without a database -- the same split `streakPolicy.ts`
 * draws from `streak.ts`. Reflections are export-only now: there is no
 * officer review surface for them to feed, no status to file the export
 * under. One row per reflection -- the member's CURRENT text, not the
 * revision history, which stays in `reflectionRevisions` for whoever holds
 * `canViewAuditLog` to reconstruct. This is the export for "what did people
 * write", not "who edited what".
 */
export const REFLECTIONS_COLUMNS = [
  "user_id",
  "preferred_name",
  "email",
  "github_login",
  "activity_type",
  "activity_id",
  "activity_title",
  "content",
  "submitted_at",
  "created_at",
  "updated_at",
  "revision_count",
] as const;

export interface ReflectionsFilters {
  from?: Date;
  to?: Date;
}

export interface ReflectionRow {
  userId: string;
  preferredName: string | null;
  email: string | null;
  githubLogin: string | null;
  activityType: "meeting" | "competition";
  activityId: string;
  activityTitle: string;
  content: string;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  revisionCount: number;
}

export function projectReflectionRow(row: ReflectionRow): unknown[] {
  return [
    row.userId,
    row.preferredName,
    row.email,
    row.githubLogin,
    row.activityType,
    row.activityId,
    row.activityTitle,
    row.content,
    csvTimestamp(row.submittedAt),
    csvTimestamp(row.createdAt),
    csvTimestamp(row.updatedAt),
    row.revisionCount,
  ];
}

export function parseReflectionsFilters(url: URL): ReflectionsFilters {
  const filters: ReflectionsFilters = {};
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (from && !Number.isNaN(Date.parse(from))) filters.from = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) filters.to = new Date(to);
  return filters;
}
