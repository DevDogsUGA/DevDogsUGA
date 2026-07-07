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
import type { ResolvedPermissions } from "~/server/actions/permissions";
import type { DiscordSyncCapability } from "~/lib/discordCapability";
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
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Roles</h3>
        <div className="flex items-center gap-2">
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

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={roles.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-3">
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
              <p className="rounded-sm border-2 border-dashed border-mauve-700 py-10 text-center text-sm text-mauve-400">
                No roles yet. Create one to get started.
              </p>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeRole && (
            <div className="drop-shadow-xl">
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
    </section>
  );
}
