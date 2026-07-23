import { PermissionFlagsBits } from "discord-api-types/v10";

/**
 * Discord permission bits bundled under the website's `canModerate` flag.
 * A Discord role must have ALL of these bits set for `canModerate` to be
 * suggested as enabled during import.
 */
export const CAN_MODERATE_BITS =
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.BanMembers;

/**
 * Maps a Discord role's permission bitfield onto the website's shared
 * permission flags. This is a one-time suggestion used when importing a
 * Discord role or previewing a new role's permissions — it has no bearing
 * on ongoing sync, which never touches permissions.
 */
export function decodeSharedPermissions(discordPerms: bigint): {
  canManageRoles: boolean;
  canModerate: boolean;
  canViewAuditLog: boolean;
} {
  return {
    canManageRoles:
      (discordPerms & PermissionFlagsBits.ManageRoles) ===
      PermissionFlagsBits.ManageRoles,
    canModerate: (discordPerms & CAN_MODERATE_BITS) === CAN_MODERATE_BITS,
    canViewAuditLog:
      (discordPerms & PermissionFlagsBits.ViewAuditLog) ===
      PermissionFlagsBits.ViewAuditLog,
  };
}

/**
 * Encodes a DevDogs role's shared permission flags as a Discord permission
 * bitfield. Used only once, to seed a brand-new Discord role's initial
 * permissions when creating it from a DevDogs role — never revisited.
 */
export function encodeSharedPermissions(role: {
  canManageRoles: boolean | null;
  canModerate: boolean | null;
  canViewAuditLog: boolean | null;
}): bigint {
  let bits = 0n;
  if (role.canManageRoles) bits |= PermissionFlagsBits.ManageRoles;
  if (role.canModerate) bits |= CAN_MODERATE_BITS;
  if (role.canViewAuditLog) bits |= PermissionFlagsBits.ViewAuditLog;
  return bits;
}

/**
 * Converts a `#rrggbb` color string (as used by the website's `roles.color`
 * column) to Discord's decimal RGB integer format. `null`/empty -> 0
 * (Discord's "no color" default).
 */
export function hexToDecimal(hex: string | null | undefined): number {
  if (!hex) return 0;
  return parseInt(hex.replace(/^#/, ""), 16);
}

/**
 * Converts a Discord decimal RGB integer to a `#rrggbb` color string. `0`
 * (Discord's "no color" default) -> `null`.
 */
export function decimalToHex(decimal: number): string | null {
  if (decimal === 0) return null;
  return "#" + decimal.toString(16).padStart(6, "0");
}
