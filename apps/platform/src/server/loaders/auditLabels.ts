import { inArray, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { profiles } from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";

/** What the audit log calls a member whose account no longer exists. */
export const DELETED_MEMBER = "Deleted member";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The member ids an audit page mentions that are worth looking up: every
 * actor, and the target of every event whose target is a member.
 */
export function memberIdsIn(
  rows: {
    actorUserId: string | null;
    targetType: string;
    targetId: string;
  }[],
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.actorUserId) ids.add(row.actorUserId);
    if (row.targetType === "user" && UUID.test(row.targetId)) {
      ids.add(row.targetId);
    }
  }
  return [...ids];
}

/**
 * The name to show for a member id. `known` maps the ids that still resolve to
 * their display name (an id with no profile name maps to itself); an id missing
 * from it belongs to a deleted member (account-deletion Q41). The log keeps the
 * raw ids, so this is only ever a label.
 */
export function memberLabel(
  id: string,
  known: ReadonlyMap<string, string>,
): string {
  return known.get(id) ?? DELETED_MEMBER;
}

/** The label for an event's actor: a member, or the system. */
export function actorLabel(
  actorUserId: string | null,
  known: ReadonlyMap<string, string>,
): string {
  return actorUserId === null ? "System" : memberLabel(actorUserId, known);
}

/**
 * The label for an event's target, or null when it is not a member (the id is
 * shown as it is).
 */
export function targetLabel(
  target: { targetType: string; targetId: string },
  known: ReadonlyMap<string, string>,
): string | null {
  if (target.targetType !== "user" || !UUID.test(target.targetId)) return null;
  return memberLabel(target.targetId, known);
}

/**
 * Looks up which of `ids` are still members, with the name to show for each.
 * A member with no preferred name is labelled with their id, so the log never
 * says "Deleted member" about someone who exists.
 */
export async function resolveMembers(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: usersInAuth.id, name: profiles.preferredName })
    .from(usersInAuth)
    .leftJoin(profiles, eq(profiles.userId, usersInAuth.id))
    .where(inArray(usersInAuth.id, ids));
  return new Map(
    rows.map((row) => {
      const name = row.name?.trim();
      return [
        row.id,
        name !== undefined && name !== "" ? name : row.id,
      ] as const;
    }),
  );
}
