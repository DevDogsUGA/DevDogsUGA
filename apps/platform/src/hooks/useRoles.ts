"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  createRole,
  updateRole,
  deleteRole,
  reorderRole,
  type CreateRoleInput,
  type ResolvedPermissions,
} from "~/server/actions/permissions";
import type { RoleRow } from "~/server/loaders/permissions";

export type { RoleRow };

export function useRoles(
  initialRoles: RoleRow[],
  callerMinRank: number,
  callerPermissions: ResolvedPermissions,
) {
  const [roles, setRoles] = useState<RoleRow[]>(initialRoles);

  const canEdit = (role: RoleRow) => role.rank > callerMinRank;

  // ── Reorder ────────────────────────────────────────────────────────────────

  const reorderMutation = useMutation({
    mutationFn: ({ roleId, newRank }: { roleId: string; newRank: number }) =>
      reorderRole(roleId, newRank),
    onMutate: ({ roleId, newRank }) => {
      const previous = roles;
      setRoles((prev) =>
        prev
          .map((r) => (r.id === roleId ? { ...r, rank: newRank } : r))
          .sort((a, b) => a.rank - b.rank),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) setRoles(ctx.previous);
    },
  });

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

    reorderMutation.mutate({ roleId: active.id as string, newRank });
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateRoleInput) => createRole(data),
    onSuccess: (_result, data) => {
      // Reload by appending an optimistic row; page revalidation will fix the ID
      setRoles((prev) =>
        [
          ...prev,
          {
            id: crypto.randomUUID(),
            title: data.title,
            description: data.description ?? "",
            rank: data.rank,
            color: data.color ?? null,
            showOnProfile: data.showOnProfile ?? true,
            isLeadership: data.isLeadership ?? false,
            canModerate: data.canModerate ?? null,
            canManageRoles: data.canManageRoles ?? null,
            canManageSuspensions: data.canManageSuspensions ?? null,
            canViewAuditLog: data.canViewAuditLog ?? null,
            canManageFeedback: data.canManageFeedback ?? null,
            canCreateCredentials: data.canCreateCredentials ?? null,
            canManageVerification: data.canManageVerification ?? null,
            discordRoleId: null,
            discordSyncedName: null,
            discordRolePosition: null,
            createdAt: new Date().toISOString(),
          },
        ].sort((a, b) => a.rank - b.rank),
      );
    },
  });

  // ── Update ─────────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: ({
      roleId,
      data,
    }: {
      roleId: string;
      data: Partial<CreateRoleInput>;
    }) => updateRole(roleId, data),
    onMutate: ({ roleId, data }) => {
      const previous = roles;
      setRoles((prev) =>
        prev.map((r) =>
          r.id === roleId
            ? {
                ...r,
                ...(data.title !== undefined && { title: data.title }),
                ...(data.description !== undefined && {
                  description: data.description,
                }),
                ...(data.rank !== undefined && { rank: data.rank }),
                ...(data.color !== undefined && { color: data.color }),
                ...(data.showOnProfile !== undefined && {
                  showOnProfile: data.showOnProfile,
                }),
                ...(data.isLeadership !== undefined && {
                  isLeadership: data.isLeadership,
                }),
                ...(data.canModerate !== undefined && {
                  canModerate: data.canModerate ?? null,
                }),
                ...(data.canManageRoles !== undefined && {
                  canManageRoles: data.canManageRoles ?? null,
                }),
                ...(data.canManageSuspensions !== undefined && {
                  canManageSuspensions: data.canManageSuspensions ?? null,
                }),
                ...(data.canViewAuditLog !== undefined && {
                  canViewAuditLog: data.canViewAuditLog ?? null,
                }),
                ...(data.canManageFeedback !== undefined && {
                  canManageFeedback: data.canManageFeedback ?? null,
                }),
                ...(data.canCreateCredentials !== undefined && {
                  canCreateCredentials: data.canCreateCredentials ?? null,
                }),
                ...(data.canManageVerification !== undefined && {
                  canManageVerification: data.canManageVerification ?? null,
                }),
              }
            : r,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) setRoles(ctx.previous);
    },
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onMutate: (roleId) => {
      const previous = roles;
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) setRoles(ctx.previous);
    },
  });

  return {
    roles,
    callerMinRank,
    callerPermissions,
    canEdit,
    handleDragEnd,
    reorderMutation,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
