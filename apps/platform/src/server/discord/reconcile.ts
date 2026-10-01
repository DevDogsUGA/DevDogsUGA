import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  Routes,
  type APIGuildMember,
  type APIRole,
  type RESTGetAPIGuildMembersQuery,
  type RESTPatchAPIGuildRoleJSONBody,
} from "discord-api-types/v10";
import { makeURLSearchParams } from "@discordjs/rest";
import { asBot } from "./api";
import { decimalToHex, hexToDecimal } from "./permissions";
import {
  applyMembershipPlan,
  pairKey,
  planMembershipSync,
} from "./membershipSync";
import { loadDiscordUserIds, pushMemberRoleChange } from "./memberSync";
import { fetchGuildRoles } from "./roleSync";
import { env } from "~/env";
import { db } from "~/server/db";
import { discordRoleMemberships, roles, userRoles } from "~/server/db/schema";

type FieldSync<T> =
  | { action: "none"; snapshot: T }
  | { action: "push"; snapshot: T; discordValue: T }
  | { action: "pull"; snapshot: T; dbValue: T };

/**
 * Diffs one field (name or color) across DB / live Discord / last-synced
 * snapshot. Per-field, DB wins on conflict. See `reconcileRoleDefinitions`.
 */
function reconcileField<T>(
  dbValue: T,
  liveValue: T,
  snapValue: T,
): FieldSync<T> {
  const dbChanged = dbValue !== snapValue;
  const liveChanged = liveValue !== snapValue;

  if (!dbChanged && !liveChanged)
    return { action: "none", snapshot: snapValue };
  if (dbChanged && !liveChanged)
    return { action: "push", snapshot: dbValue, discordValue: dbValue };
  if (!dbChanged && liveChanged)
    return { action: "pull", snapshot: liveValue, dbValue: liveValue };
  // conflict: both sides changed since the last sync, so DB wins
  return { action: "push", snapshot: dbValue, discordValue: dbValue };
}

/**
 * Cheap reconciliation of synced roles' name/color, run on every Permissions
 * page load and on Discord account link. For each synced role, diffs `name`
 * and `color` independently against the live Discord role and the last-synced
 * snapshot, then pushes, pulls, or on a same-field conflict pushes DB's value
 * to Discord. If a synced role's Discord role no longer exists, records an
 * error and skips it; it never auto-unsyncs.
 *
 * Failed Discord pushes leave the snapshot stale, so the next run retries.
 */
export async function reconcileRoleDefinitions(
  guildRoles?: APIRole[],
): Promise<{
  changes: number;
  errors: string[];
}> {
  const syncedRoles = await db
    .select()
    .from(roles)
    .where(isNotNull(roles.discordRoleId));

  if (syncedRoles.length === 0) return { changes: 0, errors: [] };

  const resolvedGuildRoles = guildRoles ?? (await fetchGuildRoles());
  const guildRolesById = new Map(resolvedGuildRoles.map((r) => [r.id, r]));

  let changes = 0;
  const errors: string[] = [];

  for (const role of syncedRoles) {
    const discordRole = guildRolesById.get(role.discordRoleId!);
    if (!discordRole) {
      errors.push(
        `Discord role for "${role.title}" no longer exists (id ${role.discordRoleId}).`,
      );
      continue;
    }

    const nameSync = reconcileField(
      role.title,
      discordRole.name,
      role.discordSyncedName ?? "",
    );
    const colorSync = reconcileField(
      hexToDecimal(role.color),
      discordRole.color,
      role.discordSyncedColor ?? 0,
    );

    if (nameSync.action === "none" && colorSync.action === "none") continue;

    const discordPatch: RESTPatchAPIGuildRoleJSONBody = {};
    if (nameSync.action === "push") discordPatch.name = nameSync.discordValue;
    if (colorSync.action === "push")
      discordPatch.color = colorSync.discordValue;

    if (Object.keys(discordPatch).length > 0) {
      try {
        await asBot().patch(
          Routes.guildRole(env.DISCORD_GUILD_ID, role.discordRoleId!),
          { body: discordPatch },
        );
      } catch (err) {
        errors.push(
          `Failed to push role "${role.title}" to Discord: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Leave the snapshot stale so this role is retried next time.
        continue;
      }
    }

    const dbUpdate: { title?: string; color?: string | null } = {};
    if (nameSync.action === "pull") dbUpdate.title = nameSync.dbValue;
    if (colorSync.action === "pull")
      dbUpdate.color = decimalToHex(colorSync.dbValue);

    await db
      .update(roles)
      .set({
        ...dbUpdate,
        discordSyncedName: nameSync.snapshot,
        discordSyncedColor: colorSync.snapshot,
      })
      .where(eq(roles.id, role.id));
    changes++;
  }

  return { changes, errors };
}

/**
 * Expensive reconciliation of guild membership for synced roles, run only
 * by the cron. Paginates `GET /guilds/{id}/members` and runs a three-way merge
 * per (user, synced role) against the last-synced snapshot: a platform-only
 * change is pushed to Discord, a Discord-only change is pulled, and a change
 * on both sides leaves nothing to do but update the snapshot. See
 * `planMembershipSync`.
 *
 * Users count as linked when they have a Discord OAuth identity or, for
 * officers, a stored Discord id. Failed pushes leave the snapshot stale, so
 * the next run retries them.
 */
export async function reconcileMembership(): Promise<{
  changes: number;
  errors: string[];
}> {
  const syncedRoles = await db
    .select({ id: roles.id, discordRoleId: roles.discordRoleId })
    .from(roles)
    .where(isNotNull(roles.discordRoleId));

  if (syncedRoles.length === 0) return { changes: 0, errors: [] };

  const roleIdByDiscordRoleId = new Map(
    syncedRoles.map((r) => [r.discordRoleId!, r.id]),
  );
  const syncedRoleIds = syncedRoles.map((r) => r.id);

  const discordUserIds = await loadDiscordUserIds();
  if (discordUserIds.size === 0) return { changes: 0, errors: [] };

  const members: APIGuildMember[] = [];
  let after: string | undefined;
  for (;;) {
    const query: RESTGetAPIGuildMembersQuery = {
      limit: 1000,
      ...(after !== undefined && { after }),
    };
    const page = (await asBot().get(Routes.guildMembers(env.DISCORD_GUILD_ID), {
      query: makeURLSearchParams(query),
    })) as APIGuildMember[];
    members.push(...page);
    if (page.length < 1000) break;
    after = page[page.length - 1]!.user.id;
  }

  const memberRoles = new Map<string, Set<string>>();
  for (const member of members) {
    memberRoles.set(member.user.id, new Set(member.roles));
  }

  const [platformRows, snapshotRows] = await Promise.all([
    db
      .select({ userId: userRoles.userId, roleId: userRoles.roleId })
      .from(userRoles)
      .where(inArray(userRoles.roleId, syncedRoleIds)),
    db
      .select({
        userId: discordRoleMemberships.userId,
        roleId: discordRoleMemberships.roleId,
      })
      .from(discordRoleMemberships)
      .where(inArray(discordRoleMemberships.roleId, syncedRoleIds)),
  ]);

  const plan = planMembershipSync({
    discordUserIds,
    roleIdByDiscordRoleId,
    memberRoles,
    platform: new Set(platformRows.map((r) => pairKey(r.userId, r.roleId))),
    snapshot: new Set(snapshotRows.map((r) => pairKey(r.userId, r.roleId))),
  });

  return applyMembershipPlan(plan, {
    pushMemberRoleChange,
    async record({ userId, roleId }, change) {
      if (change.platform === "add") {
        await db
          .insert(userRoles)
          .values({ userId, roleId })
          .onConflictDoNothing();
      } else if (change.platform === "remove") {
        await db
          .delete(userRoles)
          .where(
            and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)),
          );
      }
      if (change.snapshot) {
        await db
          .insert(discordRoleMemberships)
          .values({ userId, roleId })
          .onConflictDoUpdate({
            target: [
              discordRoleMemberships.userId,
              discordRoleMemberships.roleId,
            ],
            set: { syncedAt: sql`now()` },
          });
      } else {
        await db
          .delete(discordRoleMemberships)
          .where(
            and(
              eq(discordRoleMemberships.userId, userId),
              eq(discordRoleMemberships.roleId, roleId),
            ),
          );
      }
    },
  });
}
