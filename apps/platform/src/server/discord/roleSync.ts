import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import {
  Routes,
  type APIRole,
  type RESTPatchAPIGuildRoleJSONBody,
  type RESTPostAPIGuildRoleJSONBody,
} from "discord-api-types/v10";
import { asBot } from "./api";
import { pushMemberRoleChange } from "./memberSync";
import {
  decimalToHex,
  decodeSharedPermissions,
  encodeSharedPermissions,
  hexToDecimal,
} from "./permissions";
import { env } from "~/env";
import { db } from "~/server/db";
import { roles, userRoles } from '~/server/db/schema';
import { refreshUserPermissions } from "~/server/db/refreshPermissions";
import { identitiesInAuth } from "~/supabase/drizzle/schema";
import type { CreateRoleInput } from "~/server/actions/permissions";

/** Fields needed by `importRoleFromDiscord` — `title` and `color` come from the live Discord role. */
export type ImportRoleInput = Omit<CreateRoleInput, "title" | "color">;

export type ImportableDiscordRole = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  suggestedPermissions: ReturnType<typeof decodeSharedPermissions>;
};

type SyncableRole = Pick<
  typeof roles.$inferSelect,
  "id" | "title" | "color" | "discordRoleId"
>;

/** Fetches all roles in the DevDogs Discord guild. */
export async function fetchGuildRoles(): Promise<APIRole[]> {
  return (await asBot().get(
    Routes.guildRoles(env.DISCORD_GUILD_ID),
  )) as APIRole[];
}

/**
 * Pushes a synced role's name/color to its linked Discord role and updates
 * the sync snapshot to match. No-op if the role isn't synced.
 */
export async function pushRoleToDiscord(role: SyncableRole): Promise<void> {
  if (!role.discordRoleId) return;

  const color = hexToDecimal(role.color);

  await asBot().patch(
    Routes.guildRole(env.DISCORD_GUILD_ID, role.discordRoleId),
    {
      body: {
        name: role.title,
        color,
      } satisfies RESTPatchAPIGuildRoleJSONBody,
    },
  );

  await db
    .update(roles)
    .set({ discordSyncedName: role.title, discordSyncedColor: color })
    .where(eq(roles.id, role.id));
}

/**
 * Pulls a linked Discord role's name/color into the DB and updates the sync
 * snapshot to match. Never touches permission columns.
 */
export async function pullRoleFromDiscord(
  discordRole: APIRole,
  dbRoleId: string,
): Promise<void> {
  await db
    .update(roles)
    .set({
      title: discordRole.name,
      color: decimalToHex(discordRole.color),
      discordSyncedName: discordRole.name,
      discordSyncedColor: discordRole.color,
    })
    .where(eq(roles.id, dbRoleId));
}

/**
 * Lists Discord roles that aren't yet linked to a DevDogs role (and aren't
 * `@everyone`), with suggested permission flags decoded for the import UI.
 * Client-safe — no bigints cross the boundary.
 */
export async function listImportableDiscordRoles(): Promise<
  ImportableDiscordRole[]
> {
  const [guildRoles, linkedRows] = await Promise.all([
    fetchGuildRoles(),
    db
      .select({ discordRoleId: roles.discordRoleId })
      .from(roles)
      .where(isNotNull(roles.discordRoleId)),
  ]);

  const linkedIds = new Set(linkedRows.map((r) => r.discordRoleId));

  return guildRoles
    .filter((r) => r.id !== env.DISCORD_GUILD_ID && !linkedIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: decimalToHex(r.color),
      position: r.position,
      suggestedPermissions: decodeSharedPermissions(BigInt(r.permissions)),
    }));
}

/**
 * Imports a Discord role as a new DevDogs role. `title`/`color` are taken
 * from the live Discord role; `fields` supplies everything else (including
 * all 7 permission flags, freely edited from the suggested values). The
 * import retains the link (name/color sync going forward) but does not
 * retain any connection between the permission flags and Discord's bits.
 */
export async function importRoleFromDiscord(
  discordRoleId: string,
  fields: ImportRoleInput,
): Promise<{ id: string }> {
  const guildRoles = await fetchGuildRoles();
  const discordRole = guildRoles.find((r) => r.id === discordRoleId);
  if (!discordRole) throw new Error("Discord role not found");

  const [row] = await db
    .insert(roles)
    .values({
      title: discordRole.name,
      description: fields.description?.trim() ?? "",
      rank: fields.rank,
      color: decimalToHex(discordRole.color),
      discordRoleId,
      discordSyncedName: discordRole.name,
      discordSyncedColor: discordRole.color,
      ...(fields.showOnProfile !== undefined && {
        showOnProfile: fields.showOnProfile,
      }),
      ...(fields.isLeadership !== undefined && {
        isLeadership: fields.isLeadership,
      }),
      canModerate: fields.canModerate ?? null,
      canManageRoles: fields.canManageRoles ?? null,
      canManageSuspensions: fields.canManageSuspensions ?? null,
      canViewAuditLog: fields.canViewAuditLog ?? null,
      canManageFeedback: fields.canManageFeedback ?? null,
      canCreateCredentials: fields.canCreateCredentials ?? null,
      canManageVerification: fields.canManageVerification ?? null,
    })
    .returning({ id: roles.id });

  if (!row) throw new Error("Failed to import role");
  return { id: row.id };
}

/**
 * Counts how many users currently hold `roleId` without a linked Discord
 * account — i.e. how many would lose the role if it were synced with
 * Discord. Used by the confirmation UI before linking.
 */
export async function countUsersWithoutLinkedDiscord(
  roleId: string,
): Promise<number> {
  const discordUserIds = db
    .select({ userId: identitiesInAuth.userId })
    .from(identitiesInAuth)
    .where(eq(identitiesInAuth.provider, "discord"));

  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.roleId, roleId),
        notInArray(userRoles.userId, discordUserIds),
      ),
    );

  return rows.length;
}

/**
 * Shared side effects of linking a DevDogs role to a Discord role:
 * - strips the role from any user without a linked Discord account
 *   (the count shown by `countUsersWithoutLinkedDiscord` before confirming)
 * - best-effort grants the linked Discord role to remaining members, so
 *   membership starts in sync
 */
export async function applyDiscordLinkSideEffects(
  roleId: string,
  discordRoleId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(roles).set({ discordRoleId }).where(eq(roles.id, roleId));

    const discordUserIds = tx
      .select({ userId: identitiesInAuth.userId })
      .from(identitiesInAuth)
      .where(eq(identitiesInAuth.provider, "discord"));

    await tx
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.roleId, roleId),
          notInArray(userRoles.userId, discordUserIds),
        ),
      );

    const remaining = await tx
      .select({ discordUserId: identitiesInAuth.providerId })
      .from(userRoles)
      .innerJoin(
        identitiesInAuth,
        and(
          eq(identitiesInAuth.userId, userRoles.userId),
          eq(identitiesInAuth.provider, "discord"),
        ),
      )
      .where(eq(userRoles.roleId, roleId));

    await Promise.all(
      remaining.map((row) =>
        pushMemberRoleChange(row.discordUserId, discordRoleId, "add").catch(
          (err: unknown) => {
            console.error(
              `Failed to add Discord role ${discordRoleId} to member ${row.discordUserId}:`,
              err,
            );
          },
        ),
      ),
    );
  });
  await refreshUserPermissions();
}

/**
 * Links an existing DevDogs role to an existing Discord role. DB wins for
 * the initial sync — the Discord role is immediately renamed/recolored to
 * match the DevDogs role.
 */
export async function linkRoleToDiscord(
  roleId: string,
  discordRoleId: string,
): Promise<void> {
  const [role] = await db
    .select({ id: roles.id, title: roles.title, color: roles.color })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  if (!role) throw new Error("Role not found");

  await pushRoleToDiscord({ ...role, discordRoleId });
  await applyDiscordLinkSideEffects(roleId, discordRoleId);
}

/**
 * Creates a new Discord role from an existing DevDogs role, seeding its
 * name/color/permissions from the DevDogs role (one-time — permissions are
 * never revisited after this).
 */
export async function createDiscordRoleFromRole(roleId: string): Promise<void> {
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  if (!role) throw new Error("Role not found");
  if (role.discordRoleId)
    throw new Error("Role is already synced with Discord");

  const created = (await asBot().post(Routes.guildRoles(env.DISCORD_GUILD_ID), {
    body: {
      name: role.title,
      color: hexToDecimal(role.color),
      permissions: encodeSharedPermissions(role).toString(),
    } satisfies RESTPostAPIGuildRoleJSONBody,
  })) as APIRole;

  await db
    .update(roles)
    .set({
      discordRoleId: created.id,
      discordSyncedName: created.name,
      discordSyncedColor: created.color,
    })
    .where(eq(roles.id, roleId));

  await applyDiscordLinkSideEffects(roleId, created.id);
}

/**
 * Unsyncs a role from Discord. Clears the link and sync snapshot only — no
 * membership or Discord-side side effects.
 */
export async function unsyncRole(roleId: string): Promise<void> {
  await db
    .update(roles)
    .set({
      discordRoleId: null,
      discordSyncedName: null,
      discordSyncedColor: null,
    })
    .where(eq(roles.id, roleId));
}
