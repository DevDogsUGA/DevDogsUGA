"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DotsSixVerticalIcon,
  PencilSimpleIcon,
  XIcon,
  CheckIcon,
  GameControllerIcon,
} from "@phosphor-icons/react/ssr";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import DropTarget from "~/ui/drop-target";
import FormButton from "~/components/FormButton";
import type { RoleRow } from "~/hooks/useRoles";
import type {
  CreateRoleInput,
  ResolvedPermissions,
} from "~/server/actions/permissions";
import type { DiscordSyncCapability } from "~/lib/discordCapability";
import DiscordSyncSection from "./DiscordSyncSection";

const PERMISSION_LABELS: Record<string, string> = {
  canModerate: "Moderate reports",
  canManageRoles: "Manage roles & permissions",
  canManageSuspensions: "Manage suspensions",
  canViewAuditLog: "View audit log",
  canManageFeedback: "Manage site feedback",
  canCreateCredentials: "Create credentials",
  canManageVerification: "Manage verification",
};

const PERMISSION_KEYS = Object.keys(
  PERMISSION_LABELS,
) as (keyof ResolvedPermissions)[];

interface Props {
  role: RoleRow;
  editable: boolean;
  callerPermissions: ResolvedPermissions;
  callerCapability: DiscordSyncCapability;
  isDragOverlay?: boolean;
  isUpdating?: boolean;
  isDeleting?: boolean;
  onUpdate?: (data: Partial<CreateRoleInput>) => void;
  onDelete?: () => void;
}

export default function RoleCard({
  role,
  editable,
  callerPermissions,
  callerCapability,
  isDragOverlay = false,
  isUpdating = false,
  isDeleting = false,
  onUpdate,
  onDelete,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(role.title);
  const [description, setDescription] = useState(role.description);
  const [color, setColor] = useState(role.color ?? "#818cf8");
  const [showOnProfile, setShowOnProfile] = useState(role.showOnProfile);
  const [isLeadership, setIsLeadership] = useState(role.isLeadership);
  const [permissions, setPermissions] = useState<
    Record<string, boolean | null>
  >(() => {
    const p: Record<string, boolean | null> = {};
    for (const key of PERMISSION_KEYS)
      p[key] = role[key as keyof RoleRow] as boolean | null;
    return p;
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: role.id, disabled: !editable || isDragOverlay });

  const style = isDragOverlay
    ? {}
    : { transform: CSS.Transform.toString(transform), transition };

  function handleSave() {
    onUpdate?.({
      title: title.trim(),
      description: description.trim(),
      color,
      showOnProfile,
      isLeadership,
      ...Object.fromEntries(PERMISSION_KEYS.map((k) => [k, permissions[k]])),
    });
    setExpanded(false);
  }

  function handleCancel() {
    setTitle(role.title);
    setDescription(role.description);
    setColor(role.color ?? "#818cf8");
    setShowOnProfile(role.showOnProfile);
    setIsLeadership(role.isLeadership);
    const p: Record<string, boolean | null> = {};
    for (const key of PERMISSION_KEYS)
      p[key] = role[key as keyof RoleRow] as boolean | null;
    setPermissions(p);
    setExpanded(false);
  }

  const accentColor = role.color ?? "#818cf8";

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style}>
        <DropTarget className="h-17 w-full" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: accentColor }}
      className="rounded-sm border-2 border-l-4 border-mauve-600 bg-mauve-800 transition-opacity"
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Drag handle */}
        {editable && !isDragOverlay && (
          <button
            {...attributes}
            {...listeners}
            className="-m-2 flex shrink-0 cursor-grab touch-none items-center justify-center rounded-sm p-2 text-mauve-500 transition-colors hover:bg-white/10 hover:text-white active:cursor-grabbing"
            aria-label="Drag to reorder"
            tabIndex={0}
          >
            <DotsSixVerticalIcon
              className="size-4.5 shrink-0 md:size-4"
              aria-hidden
            />
          </button>
        )}

        {/* Color dot */}
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />

        {/* Title + description */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-white">
            {role.title}
          </span>
          {role.description && (
            <span className="truncate text-xs text-white/50">
              {role.description}
            </span>
          )}
        </div>

        {/* Discord sync badge */}
        {role.discordRoleId !== null && (
          <span
            className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-indigo-300"
            title="Name and color sync with this Discord role; only members with a linked Discord account can be assigned this role."
          >
            <GameControllerIcon className="h-3 w-3" aria-hidden />
            {role.discordSyncedName}
          </span>
        )}

        {/* Rank badge */}
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
          #{Math.round(role.rank)}
        </span>

        {/* Edit button */}
        {editable && !isDragOverlay && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-sm p-1 text-white/40 transition outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label={expanded ? "Collapse" : "Edit"}
          >
            {expanded ? (
              <XIcon className="h-4 w-4" aria-hidden />
            ) : (
              <PencilSimpleIcon className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      {/* Edit panel */}
      {expanded && editable && (
        <div className="flex flex-col gap-4 border-t border-mauve-600 px-4 py-4">
          {/* Title */}
          <label className="flex flex-col gap-1 text-xs font-medium text-white/70">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
              placeholder="Role title"
            />
          </label>

          {/* Description */}
          <label className="flex flex-col gap-1 text-xs font-medium text-white/70">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
              placeholder="Brief description of this role"
            />
          </label>

          {/* Color */}
          <label className="flex items-center gap-3 text-xs font-medium text-white/70">
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
            />
            <span className="font-mono text-white/50">{color}</span>
          </label>

          {/* Display */}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-white/70">
              Display
            </legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/80">
              <input
                type="checkbox"
                checked={showOnProfile}
                onChange={(e) => setShowOnProfile(e.target.checked)}
                className="accent-indigo-400"
              />
              Show this role on members&apos; profiles
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/80">
              <input
                type="checkbox"
                checked={isLeadership}
                onChange={(e) => setIsLeadership(e.target.checked)}
                className="accent-indigo-400"
              />
              Leadership role (homepage + Role Description field)
            </label>
          </fieldset>

          {/* Permissions */}
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-white/70">
              Permissions
            </legend>
            <div className="grid grid-cols-1 gap-y-2 @sm:grid-cols-2">
              {PERMISSION_KEYS.map((key) => {
                const callerHas = callerPermissions[key];
                return (
                  <label
                    key={key}
                    className={[
                      "flex cursor-pointer items-center gap-2 text-xs",
                      callerHas
                        ? "text-white/80"
                        : "cursor-not-allowed text-white/30",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={permissions[key] === true}
                      disabled={!callerHas}
                      onChange={(e) =>
                        setPermissions((p) => ({
                          ...p,
                          [key]: e.target.checked ? true : null,
                        }))
                      }
                      className="accent-indigo-400"
                    />
                    {PERMISSION_LABELS[key]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Discord sync */}
          <DiscordSyncSection role={role} callerCapability={callerCapability} />

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <ConfirmDestructiveAction
              title="Delete role"
              description={
                <>
                  This will permanently delete the <strong>{role.title}</strong>{" "}
                  role and remove it from all users. This cannot be undone.
                </>
              }
              action={async () => onDelete?.()}
              submitLabel="Delete"
              userConfirmText={role.title}
            >
              <FormButton
                theme="rose"
                type="submit"
                disabled={isDeleting}
                className="text-xs"
              >
                Delete role
              </FormButton>
            </ConfirmDestructiveAction>

            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isUpdating || !title.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                {isUpdating ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
