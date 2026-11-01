"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState } from "react";
import { useRoles, type RoleRow } from "~/hooks/useRoles";
import type { ResolvedPermissions } from "~/server/auth/permissions";
import type { DiscordSyncCapability } from "~/lib/discordCapability";
import Callout from "~/ui/callout";
import { EmptyState } from "~/ui/empty-state";
import RoleCard from "./RoleCard";
import CreateRoleDialog from "./CreateRoleDialog";
import ImportDiscordRoleDialog from "./ImportDiscordRoleDialog";

interface Props {
  initialRoles: RoleRow[];
  callerMinRank: number;
  callerPermissions: ResolvedPermissions;
  callerCapability: DiscordSyncCapability;
}

export default function RolesManager({
  initialRoles,
  callerMinRank,
  callerPermissions,
  callerCapability,
}: Props) {
  const {
    roles,
    canEdit,
    handleDragEnd,
    createMutation,
    updateMutation,
    deleteMutation,
  } = useRoles(initialRoles, callerMinRank, callerPermissions);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRole = roles.find((r) => r.id === activeId);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    handleDragEnd(event);
  }

  const nextRank =
    roles.length > 0 ? Math.max(...roles.map((r) => r.rank)) + 1 : 1;

  return (
    <div>
      <div className="con-toolbar">
        <p className="help" style={{ margin: 0 }}>
          Order is rank: the top role outranks the ones below. Drag a row, or
          focus its handle and use the arrow keys.
        </p>
        <div className="con-toolbar-acts">
          <ImportDiscordRoleDialog
            nextRank={nextRank}
            callerPermissions={callerPermissions}
            callerCapability={callerCapability}
          />
          <CreateRoleDialog
            nextRank={nextRank}
            callerPermissions={callerPermissions}
            isPending={createMutation.isPending}
            onCreate={(data) => createMutation.mutate(data)}
          />
        </div>
      </div>

      {roles.length > 0 && !roles.some((r) => canEdit(r)) && (
        <Callout tone="info" title="You can see roles but not change them.">
          Editing needs Manage roles &amp; permissions, and you can only touch
          roles ranked below yours.
        </Callout>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={roles.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="con-rolelist">
            {roles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                editable={canEdit(role)}
                callerPermissions={callerPermissions}
                callerCapability={callerCapability}
                isUpdating={
                  updateMutation.isPending &&
                  updateMutation.variables?.roleId === role.id
                }
                isDeleting={
                  deleteMutation.isPending &&
                  deleteMutation.variables === role.id
                }
                onUpdate={(data) =>
                  updateMutation.mutate({ roleId: role.id, data })
                }
                onDelete={() => deleteMutation.mutate(role.id)}
              />
            ))}
            {roles.length === 0 && (
              <EmptyState
                title="No roles yet"
                description="Create one to get started."
              />
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeRole && (
            <div className="con-dragging">
              <RoleCard
                role={activeRole}
                editable={false}
                callerPermissions={callerPermissions}
                callerCapability={callerCapability}
                isDragOverlay
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
