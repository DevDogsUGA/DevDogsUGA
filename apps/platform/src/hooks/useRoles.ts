"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DragEndEvent } from "@dnd-kit/core";
import type { ActionResult } from "~/lib/actionResult";
import {
  updateRole,
  reorderRole,
  type CreateRoleInput,
} from "~/server/actions/permissions";
import type { ResolvedPermissions } from "~/server/auth/permissions";
import type { RoleRow } from "~/server/loaders/permissions";
import { useCommand } from "~/ui/use-command";

export type { RoleRow };

/**
 * The role list: the server's roles, with the order held locally for the
 * moment of a drag. Create and delete are Commands owned by the dialog and the
 * card they belong to, and each refreshes the page, so the roles come back from
 * the server rather than being guessed here. A role's edit mode saves through
 * `saveRole` as a Draft on the save bar.
 */
export function useRoles(
  initialRoles: RoleRow[],
  callerMinRank: number,
  callerPermissions: ResolvedPermissions,
) {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleRow[]>(initialRoles);
  // A refresh hands down new roles; adopt them rather than keep the old copy.
  const [seenRoles, setSeenRoles] = useState(initialRoles);
  if (seenRoles !== initialRoles) {
    setSeenRoles(initialRoles);
    setRoles(initialRoles);
  }

  const canEdit = (role: RoleRow) => role.rank > callerMinRank;

  // ── Reorder ────────────────────────────────────────────────────────────────

  // The row moves at the drop, ahead of the server. A refusal puts the list back
  // and shows beside it; a success refreshes to the server's order.
  const reorder = useCommand(
    async (roleId: string, newRank: number, previous: RoleRow[]) => {
      const result = await reorderRole(roleId, newRank);
      if (!result.ok) setRoles(previous);
      return result;
    },
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sorted = [...roles].sort((a, b) => a.rank - b.rank);
    const activeIdx = sorted.findIndex((r) => r.id === active.id);
    const overIdx = sorted.findIndex((r) => r.id === over.id);
    if (activeIdx === -1 || overIdx === -1) return;

    // Determine neighbors at the destination position
    const movingDown = overIdx > activeIdx;
    const left = movingDown ? sorted[overIdx] : sorted[overIdx - 1];
    const right = movingDown ? sorted[overIdx + 1] : sorted[overIdx];

    const newRank =
      left === undefined
        ? (right?.rank ?? 1) - 1
        : right === undefined
          ? left.rank + 1
          : (left.rank + right.rank) / 2;

    const roleId = active.id as string;
    const previous = roles;
    setRoles((prev) =>
      prev
        .map((r) => (r.id === roleId ? { ...r, rank: newRank } : r))
        .sort((a, b) => a.rank - b.rank),
    );
    reorder.run(roleId, newRank, previous);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async function saveRole(
    roleId: string,
    data: Partial<CreateRoleInput>,
  ): Promise<ActionResult> {
    const result = await updateRole(roleId, data);
    if (result.ok) router.refresh();
    return result;
  }

  return {
    roles,
    callerMinRank,
    callerPermissions,
    canEdit,
    handleDragEnd,
    reorder,
    saveRole,
  };
}
