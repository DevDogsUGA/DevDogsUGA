/**
 * The three-way merge behind `reconcileMembership`, free of database and
 * Discord imports so it can be tested against stubbed Discord responses.
 *
 * For each (user, synced role) pair there are three yes/no facts: does the
 * platform have the grant, does Discord, and did both sides have it at the
 * last successful sync (the snapshot). Whichever side differs from the
 * snapshot changed since; if both changed they already agree, so only the
 * snapshot needs to move.
 */

export type Pair = { userId: string; roleId: string };

export type PushOp = Pair & {
  discordUserId: string;
  discordRoleId: string;
  action: "add" | "remove";
};

export type MembershipPlan = {
  /** Platform changed only: apply to Discord, then record in the snapshot. */
  pushes: PushOp[];
  /** Discord changed only: apply to the platform and the snapshot. */
  pulls: (Pair & { action: "add" | "remove" })[];
  /** Both sides agree but the snapshot is stale. */
  snapshotOnly: (Pair & { present: boolean })[];
};

export type MembershipState = {
  /** Platform user -> Discord user id (OAuth-linked, or an officer's stored id). */
  discordUserIds: Map<string, string>;
  /** Discord role id -> platform role id, for synced roles only. */
  roleIdByDiscordRoleId: Map<string, string>;
  /** Discord user id -> Discord role ids held, for guild members only. */
  memberRoles: Map<string, Set<string>>;
  /** `userId:roleId` for every platform grant of a synced role. */
  platform: Set<string>;
  /** `userId:roleId` for every pair both sides held at the last sync. */
  snapshot: Set<string>;
};

export const pairKey = (userId: string, roleId: string) =>
  `${userId}:${roleId}`;

/**
 * Users without a known Discord id never appear: their grants have no
 * snapshot, so they are pushed on the first run after the id is known. Users
 * absent from the guild are skipped too, since nothing can be read or pushed.
 */
export function planMembershipSync(state: MembershipState): MembershipPlan {
  const plan: MembershipPlan = { pushes: [], pulls: [], snapshotOnly: [] };

  for (const [userId, discordUserId] of state.discordUserIds) {
    const held = state.memberRoles.get(discordUserId);
    if (!held) continue;

    for (const [discordRoleId, roleId] of state.roleIdByDiscordRoleId) {
      const key = pairKey(userId, roleId);
      const onPlatform = state.platform.has(key);
      const onDiscord = held.has(discordRoleId);
      const synced = state.snapshot.has(key);

      if (onPlatform === onDiscord) {
        if (synced !== onPlatform)
          plan.snapshotOnly.push({ userId, roleId, present: onPlatform });
      } else if (synced === onDiscord) {
        plan.pushes.push({
          userId,
          roleId,
          discordUserId,
          discordRoleId,
          action: onPlatform ? "add" : "remove",
        });
      } else {
        plan.pulls.push({
          userId,
          roleId,
          action: onDiscord ? "add" : "remove",
        });
      }
    }
  }

  return plan;
}

export type MembershipIo = {
  pushMemberRoleChange(
    discordUserId: string,
    discordRoleId: string,
    action: "add" | "remove",
  ): Promise<void>;
  /** Writes the platform grant (when `platform`) and the snapshot row. */
  record(
    pair: Pair,
    change: { platform?: "add" | "remove"; snapshot: boolean },
  ): Promise<void>;
};

/**
 * Applies a plan. A failed push leaves the snapshot untouched, so the next run
 * plans the same push again.
 */
export async function applyMembershipPlan(
  plan: MembershipPlan,
  io: MembershipIo,
): Promise<{ changes: number; errors: string[] }> {
  const errors: string[] = [];
  let changes = 0;

  for (const op of plan.pushes) {
    try {
      await io.pushMemberRoleChange(
        op.discordUserId,
        op.discordRoleId,
        op.action,
      );
    } catch (err) {
      errors.push(
        `Failed to ${op.action} Discord role ${op.discordRoleId} for member ${op.discordUserId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    await io.record(op, { snapshot: op.action === "add" });
    changes++;
  }

  for (const op of plan.pulls) {
    await io.record(op, { platform: op.action, snapshot: op.action === "add" });
    changes++;
  }

  for (const op of plan.snapshotOnly) {
    await io.record(op, { snapshot: op.present });
  }

  return { changes, errors };
}
