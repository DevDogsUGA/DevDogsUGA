"use client";

import { useState, type CSSProperties } from "react";
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
import Badge from "~/ui/badge";
import { Button } from "~/ui/button";
import { Checkbox } from "~/ui/checkbox";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
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
  canManageAttendance: "Manage attendance",
  canPreviewDocs: "Preview docs",
  canManageOAuthApps: "Manage OAuth apps",
  canDeleteAccounts: "Delete accounts",
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
      style={style}
      className="con-rolecard"
      data-open={expanded || undefined}
    >
      <div className="con-rolerow">
        {editable && !isDragOverlay && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="iconbtn con-grip"
            aria-label={`Reorder ${role.title}`}
          >
            <DotsSixVerticalIcon weight="bold" aria-hidden />
          </button>
        )}

        {!(editable && !isDragOverlay) && (
          <span className="con-grip" aria-hidden />
        )}

        <span
          className="con-swatch"
          style={{ "--rc": accentColor } as CSSProperties}
          aria-hidden
        />

        <div className="con-rolename">
          <b>{role.title}</b>
          {role.description && <small>{role.description}</small>}
        </div>

        <div className="con-rolemeta">
          {role.discordRoleId !== null && (
            <Badge variant="info">
              <GameControllerIcon weight="bold" aria-hidden />
              {role.discordSyncedName}
            </Badge>
          )}
          <Badge>Rank {Math.round(role.rank)}</Badge>
          {editable && !isDragOverlay && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <XIcon weight="bold" aria-hidden />
              ) : (
                <PencilSimpleIcon weight="bold" aria-hidden />
              )}
              {expanded ? "Close" : "Edit"}
            </Button>
          )}
        </div>
      </div>

      {expanded && editable && (
        <div className="con-roleedit">
          <Field label="Title" htmlFor={`role-title-${role.id}`}>
            <Input
              id={`role-title-${role.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Role title"
            />
          </Field>

          <Field label="Description" htmlFor={`role-desc-${role.id}`}>
            <Textarea
              id={`role-desc-${role.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of this role"
            />
          </Field>

          <label className="con-color">
            <span className="label">Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <code className="con-code">{color}</code>
          </label>

          <fieldset className="con-checks">
            <legend className="eyebrow">Display</legend>
            <Checkbox
              checked={showOnProfile}
              onChange={(e) => setShowOnProfile(e.target.checked)}
              label="Show this role on members' profiles"
            />
            <Checkbox
              checked={isLeadership}
              onChange={(e) => setIsLeadership(e.target.checked)}
              label="Leadership role (homepage + Role Description field)"
            />
          </fieldset>

          <fieldset className="con-checks">
            <legend className="eyebrow">Permissions</legend>
            <div className="con-perm-edit">
              {PERMISSION_KEYS.map((key) => {
                const callerHas = callerPermissions[key];
                return (
                  <Checkbox
                    key={key}
                    checked={permissions[key] === true}
                    disabled={!callerHas}
                    onChange={(e) =>
                      setPermissions((p) => ({
                        ...p,
                        [key]: e.target.checked ? true : null,
                      }))
                    }
                    label={PERMISSION_LABELS[key]}
                  />
                );
              })}
            </div>
          </fieldset>

          <DiscordSyncSection role={role} callerCapability={callerCapability} />

          <div className="con-roleactions">
            <ConfirmDestructiveAction
              title={`Delete the ${role.title} role?`}
              description={
                <>
                  This permanently deletes the <strong>{role.title}</strong>{" "}
                  role and removes it from everyone who holds it. Type the role
                  name to confirm.
                </>
              }
              action={async () => onDelete?.()}
              submitLabel="Delete role"
              userConfirmText={role.title}
            >
              <FormButton
                theme="rose"
                variant="destructive"
                type="submit"
                disabled={isDeleting}
                size="sm"
              >
                Delete role
              </FormButton>
            </ConfirmDestructiveAction>

            <div className="acts" style={{ display: "flex", gap: 10 }}>
              <Button type="button" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isUpdating || !title.trim()}
                loading={isUpdating}
              >
                <CheckIcon weight="bold" aria-hidden />
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
