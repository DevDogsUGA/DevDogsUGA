"use client";

import { useState, type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DotsSixVerticalIcon,
  PencilSimpleIcon,
  XIcon,
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
import type { ActionResult } from "~/lib/actionResult";
import { deleteRole, type CreateRoleInput } from "~/server/actions/permissions";
import type { ResolvedPermissions } from "~/server/auth/permissions";
import type { DiscordSyncCapability } from "~/lib/discordCapability";
import {
  FieldError,
  useBlurredError,
  useSettingsField,
} from "~/ui/settings-form";
import { CommandFeedback, useCommand } from "~/ui/use-command";
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
  canReviewProjectReports: "Review project reports",
};

const PERMISSION_KEYS = Object.keys(
  PERMISSION_LABELS,
) as (keyof ResolvedPermissions)[];

/** Everything a role's edit mode changes, held as one Draft. */
interface RoleDraft {
  title: string;
  description: string;
  color: string;
  showOnProfile: boolean;
  isLeadership: boolean;
  permissions: Record<string, boolean | null>;
}

function draftOf(role: RoleRow): RoleDraft {
  const permissions: Record<string, boolean | null> = {};
  for (const key of PERMISSION_KEYS)
    permissions[key] = role[key as keyof RoleRow] as boolean | null;
  return {
    title: role.title,
    description: role.description,
    color: role.color ?? "#818cf8",
    showOnProfile: role.showOnProfile,
    isLeadership: role.isLeadership,
    permissions,
  };
}

function sameDraft(a: RoleDraft, b: RoleDraft): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.color === b.color &&
    a.showOnProfile === b.showOnProfile &&
    a.isLeadership === b.isLeadership &&
    PERMISSION_KEYS.every((key) => a.permissions[key] === b.permissions[key])
  );
}

interface Props {
  role: RoleRow;
  editable: boolean;
  callerPermissions: ResolvedPermissions;
  callerCapability: DiscordSyncCapability;
  isDragOverlay?: boolean;
  /** Saves the edit-mode Draft. A refusal returns for the save bar to show. */
  onUpdate?: (data: Partial<CreateRoleInput>) => Promise<ActionResult>;
}

/**
 * One role in the list. Edit mode is a Draft field on the page's save bar,
 * `role:<id>`: the card stays open while it has unsaved changes and closes after
 * a successful save, and the bar's Discard puts it back to the saved values.
 * Delete is a Command with its own confirm, and its refusal shows in the card.
 */
export default function RoleCard({
  role,
  editable,
  callerPermissions,
  callerCapability,
  isDragOverlay = false,
  onUpdate,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(() => draftOf(role));
  const [draft, setDraft] = useState(saved);
  const dirty = !sameDraft(draft, saved);
  const open = expanded || dirty;
  const canEdit = editable && !isDragOverlay;

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

  async function save() {
    const title = draft.title.trim();
    const description = draft.description.trim();
    const result = await onUpdate?.({
      title,
      description,
      color: draft.color,
      showOnProfile: draft.showOnProfile,
      isLeadership: draft.isLeadership,
      ...Object.fromEntries(
        PERMISSION_KEYS.map((key) => [key, draft.permissions[key]]),
      ),
    });
    if (result?.ok) {
      const next = { ...draft, title, description };
      setSaved(next);
      setDraft(next);
      setExpanded(false);
    }
    return result;
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
      data-open={open || undefined}
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
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={open}
              disabled={dirty}
              onClick={() => setExpanded((v) => !v)}
            >
              {open ? (
                <XIcon weight="bold" aria-hidden />
              ) : (
                <PencilSimpleIcon weight="bold" aria-hidden />
              )}
              {open ? "Close" : "Edit"}
            </Button>
          )}
        </div>
      </div>

      {open && canEdit && (
        <RoleEditor
          role={role}
          draft={draft}
          isDirty={dirty}
          onChange={(patch) =>
            setDraft((current) => ({ ...current, ...patch }))
          }
          save={save}
          reset={() => setDraft(saved)}
          callerPermissions={callerPermissions}
          callerCapability={callerCapability}
        />
      )}
    </div>
  );
}

/**
 * A role's edit mode. Mounted only while the card is open, so each card
 * registers with the save bar while it can have changes, and the drag overlay's
 * copy of the card never competes for the same id.
 */
function RoleEditor({
  role,
  draft,
  isDirty,
  onChange,
  save,
  reset,
  callerPermissions,
  callerCapability,
}: {
  role: RoleRow;
  draft: RoleDraft;
  isDirty: boolean;
  onChange: (patch: Partial<RoleDraft>) => void;
  save: () => Promise<ActionResult | undefined>;
  reset: () => void;
  callerPermissions: ResolvedPermissions;
  callerCapability: DiscordSyncCapability;
}) {
  const remove = useCommand(deleteRole);
  const titleError = draft.title.trim() ? null : "Enter a role title.";
  const { isSaving, serverError } = useSettingsField({
    id: `role:${role.id}`,
    label: `${role.title} role`,
    draft,
    isDirty,
    error: titleError,
    save,
    reset,
  });
  const shownTitleError = useBlurredError(titleError);

  return (
    <div className="con-roleedit">
      <Field
        label="Title"
        htmlFor={`role-title-${role.id}`}
        error={shownTitleError.error}
      >
        <Input
          id={`role-title-${role.id}`}
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          onBlur={shownTitleError.onBlur}
          disabled={isSaving}
          placeholder="Role title"
        />
      </Field>

      <Field label="Description" htmlFor={`role-desc-${role.id}`}>
        <Textarea
          id={`role-desc-${role.id}`}
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          disabled={isSaving}
          rows={2}
          placeholder="Brief description of this role"
        />
      </Field>

      <label className="con-color">
        <span className="label">Color</span>
        <input
          type="color"
          value={draft.color}
          onChange={(e) => onChange({ color: e.target.value })}
          disabled={isSaving}
        />
        <code className="con-code">{draft.color}</code>
      </label>

      <fieldset className="con-checks">
        <legend className="eyebrow">Display</legend>
        <Checkbox
          checked={draft.showOnProfile}
          onChange={(e) => onChange({ showOnProfile: e.target.checked })}
          disabled={isSaving}
          label="Show this role on members' profiles"
        />
        <Checkbox
          checked={draft.isLeadership}
          onChange={(e) => onChange({ isLeadership: e.target.checked })}
          disabled={isSaving}
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
                checked={draft.permissions[key] === true}
                disabled={!callerHas || isSaving}
                onChange={(e) =>
                  onChange({
                    permissions: {
                      ...draft.permissions,
                      [key]: e.target.checked ? true : null,
                    },
                  })
                }
                label={PERMISSION_LABELS[key]}
              />
            );
          })}
        </div>
      </fieldset>

      <FieldError error={serverError} />

      <DiscordSyncSection role={role} callerCapability={callerCapability} />

      <div className="con-roleactions">
        <ConfirmDestructiveAction
          title={`Delete the ${role.title} role?`}
          description={
            <>
              This permanently deletes the <strong>{role.title}</strong> role
              and removes it from everyone who holds it. Type the role name to
              confirm.
            </>
          }
          action={() => remove.run(role.id)}
          submitLabel="Delete role"
          userConfirmText={role.title}
        >
          <FormButton
            theme="rose"
            variant="destructive"
            type="submit"
            disabled={remove.pending}
            size="sm"
          >
            Delete role
          </FormButton>
        </ConfirmDestructiveAction>
        <CommandFeedback result={remove.result} />
      </div>
    </div>
  );
}
