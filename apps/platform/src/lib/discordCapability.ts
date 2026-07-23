export type DiscordSyncCapability =
  | { linked: false }
  | {
      linked: true;
      isOwner: boolean;
      hasManageRoles: boolean;
      highestPosition: number;
    };

/** Mirrors Discord's hierarchy rule: manage roles strictly below your highest role (owners bypass). */
export function canManageDiscordRolePosition(
  capability: DiscordSyncCapability,
  targetPosition: number,
): boolean {
  if (!capability.linked) return false;
  if (capability.isOwner) return true;
  return (
    capability.hasManageRoles && capability.highestPosition > targetPosition
  );
}
