"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DotsSixVerticalIcon,
  PencilSimpleIcon,
  XIcon,
  GameControllerIcon,
} from "@phosphor-icons/react/ssr";
import ConfirmDestructiveAction from "~/classic/ui/confirm-destructive-action";
import DropTarget from "~/classic/ui/drop-target";
import FormButton from "~/classic/components/FormButton";
import type { RoleRow } from "~/hooks/useRoles";
import type { ActionResult } from "~/lib/actionResult";
import { deleteRole, type CreateRoleInput } from "~/server/actions/permissions";
import type { ResolvedPermissions } from "~/server/auth/permissions";
import type { DiscordSyncCapability } from "~/lib/discordCapability";
import {
  FieldError,
  useBlurredError,
  useSettingsField,
} from "~/classic/ui/settings-form";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";
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
      style={{ ...style, borderLeftColor: accentColor }}
      className="rounded-sm border-2 border-l-4 border-mauve-600 bg-mauve-800 transition-opacity"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {editable && !isDragOverlay && (
          <button
            type="button"
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

        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />

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

        {role.discordRoleId !== null && (
          <span
            className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-indigo-300"
            title="Name and color sync with this Discord role; only members with a linked Discord account can be assigned this role."
          >
            <GameControllerIcon className="h-3 w-3" aria-hidden />
            {role.discordSyncedName}
          </span>
        )}

        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
          #{Math.round(role.rank)}
        </span>

        {editable && !isDragOverlay && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            disabled={dirty}
            className="rounded-sm p-1 text-white/40 transition outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={open ? "Collapse" : "Edit"}
            aria-expanded={open}
          >
            {open ? (
              <XIcon className="h-4 w-4" aria-hidden />
            ) : (
              <PencilSimpleIcon className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      {open && editable && !isDragOverlay && (
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
    <div className="flex flex-col gap-4 border-t border-mauve-600 px-4 py-4">
      <label className="flex flex-col gap-1 text-xs font-medium text-white/70">
        Title
        <input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          onBlur={shownTitleError.onBlur}
          disabled={isSaving}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
          placeholder="Role title"
        />
        {shownTitleError.error && (
          <span role="alert" className="text-xs text-rose-400">
            {shownTitleError.error}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-white/70">
        Description
        <textarea
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          disabled={isSaving}
          rows={2}
          className="resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
          placeholder="Brief description of this role"
        />
      </label>

      <label className="flex items-center gap-3 text-xs font-medium text-white/70">
        Color
        <input
          type="color"
          value={draft.color}
          onChange={(e) => onChange({ color: e.target.value })}
          disabled={isSaving}
          className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
        />
        <span className="font-mono text-white/50">{draft.color}</span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-white/70">
          Display
        </legend>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/80">
          <input
            type="checkbox"
            checked={draft.showOnProfile}
            onChange={(e) => onChange({ showOnProfile: e.target.checked })}
            disabled={isSaving}
            className="accent-indigo-400"
          />
          Show this role on members&apos; profiles
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/80">
          <input
            type="checkbox"
            checked={draft.isLeadership}
            onChange={(e) => onChange({ isLeadership: e.target.checked })}
            disabled={isSaving}
            className="accent-indigo-400"
          />
          Leadership role (homepage + Role Description field)
        </label>
      </fieldset>

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
                  className="accent-indigo-400"
                />
                {PERMISSION_LABELS[key]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <FieldError error={serverError} />

      <DiscordSyncSection role={role} callerCapability={callerCapability} />

      <div className="flex items-center justify-between gap-3">
        <ConfirmDestructiveAction
          title="Delete role"
          description={
            <>
              This will permanently delete the <strong>{role.title}</strong>{" "}
              role and remove it from all users. This cannot be undone.
            </>
          }
          action={() => remove.run(role.id)}
          submitLabel="Delete"
          userConfirmText={role.title}
        >
          <FormButton
            theme="rose"
            type="submit"
            disabled={remove.pending}
            className="text-xs"
          >
            Delete role
          </FormButton>
        </ConfirmDestructiveAction>

        <CommandFeedback result={remove.result} />
      </div>
    </div>
  );
}
