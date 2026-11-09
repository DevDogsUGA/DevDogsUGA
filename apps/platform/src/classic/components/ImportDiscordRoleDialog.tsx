"use client";

import { useState } from "react";
import { GameControllerIcon, XIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/classic/components/FormButton";
import type { ResolvedPermissions } from "~/server/auth/permissions";
import {
  importRoleFromDiscord,
  listImportableDiscordRoles,
} from "~/server/actions/discordRoleSync";
import {
  canManageDiscordRolePosition,
  type DiscordSyncCapability,
} from "~/lib/discordCapability";
import type {
  ImportableDiscordRole,
  ImportRoleInput,
} from "~/server/discord/roleSync";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/classic/ui/dialog";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";

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

interface Props {
  nextRank: number;
  callerPermissions: ResolvedPermissions;
  callerCapability: DiscordSyncCapability;
}

/**
 * Imports a Discord role as a new role. The form is its own component so each
 * opening starts with no stale error and the inputs reset.
 */
export default function ImportDiscordRoleDialog({
  nextRank,
  callerPermissions,
  callerCapability,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [discordRoles, setDiscordRoles] = useState<ImportableDiscordRole[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const canSync =
    callerCapability.linked &&
    (callerCapability.isOwner || callerCapability.hasManageRoles);
  const triggerDisabledReason = !callerCapability.linked
    ? "Link your Discord account to use Discord sync."
    : !canSync
      ? "Your Discord account needs the Manage Roles permission."
      : null;

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) return;

    setListError(null);
    setLoading(true);
    listImportableDiscordRoles()
      .then(setDiscordRoles)
      .catch((err: unknown) =>
        setListError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <span title={triggerDisabledReason ?? undefined}>
        <DialogTrigger asChild disabled={!canSync}>
          <button
            disabled={!canSync}
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-medium text-white transition outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/5"
          >
            <GameControllerIcon aria-hidden />
            Import from Discord
          </button>
        </DialogTrigger>
      </span>

      <DialogContent
        className="max-w-md border-white/20 bg-mauve-900 p-0 shadow-2xl"
        showCloseButton={false}
      >
        <ImportDiscordRoleForm
          nextRank={nextRank}
          callerPermissions={callerPermissions}
          callerCapability={callerCapability}
          discordRoles={discordRoles}
          loading={loading}
          listError={listError}
          onImported={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ImportDiscordRoleForm({
  nextRank,
  callerPermissions,
  callerCapability,
  discordRoles,
  loading,
  listError,
  onImported,
}: Props & {
  discordRoles: ImportableDiscordRole[];
  loading: boolean;
  listError: string | null;
  onImported: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [description, setDescription] = useState("");
  const [rank, setRank] = useState(nextRank);
  const [showOnProfile, setShowOnProfile] = useState(true);
  const [isLeadership, setIsLeadership] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const {
    run,
    pending: submitting,
    result,
  } = useCommand(async (discordRoleId: string, fields: ImportRoleInput) => {
    const outcome = await importRoleFromDiscord(discordRoleId, fields);
    if (outcome.ok) onImported();
    return outcome;
  });

  const selected = discordRoles.find((r) => r.id === selectedId);

  function handleSelect(id: string) {
    setSelectedId(id);
    const role = discordRoles.find((r) => r.id === id);
    if (!role) return;
    setPermissions((p) => ({
      ...p,
      canManageRoles: role.suggestedPermissions.canManageRoles,
      canModerate: role.suggestedPermissions.canModerate,
      canViewAuditLog: role.suggestedPermissions.canViewAuditLog,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      setError("Select a Discord role to import.");
      return;
    }

    setError(null);
    run(selectedId, {
      description: description.trim() || undefined,
      rank,
      showOnProfile,
      isLeadership,
      ...Object.fromEntries(
        PERMISSION_KEYS.map((k) => [k, permissions[k] ? true : null]),
      ),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex max-h-[85vh] flex-col gap-5 overflow-y-auto px-5 py-6"
    >
      <DialogHeader className="flex-row items-center justify-between">
        <DialogTitle className="text-base font-semibold text-white">
          Import from Discord
        </DialogTitle>
        <DialogClose className="rounded-sm p-1 text-white/40 transition outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/50">
          <XIcon aria-hidden />
        </DialogClose>
      </DialogHeader>

      {/* Discord role */}
      <label className="flex flex-col gap-1 text-xs font-medium text-white/70">
        Discord role *
        <select
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={loading}
          required
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-white/40"
        >
          <option value="">
            {loading ? "Loading…" : "Select a Discord role…"}
          </option>
          {discordRoles.map((r) => {
            const canManage = canManageDiscordRolePosition(
              callerCapability,
              r.position,
            );
            return (
              <option key={r.id} value={r.id} disabled={!canManage}>
                {r.name}
                {canManage ? "" : " (above your Discord roles)"}
              </option>
            );
          })}
        </select>
      </label>

      {selected && (
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: selected.color ?? "#818cf8" }}
            aria-hidden
          />
          Name and color are taken from this Discord role and will stay in sync
          going forward.
        </div>
      )}

      {/* Description */}
      <label className="flex flex-col gap-1 text-xs font-medium text-white/70">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional — briefly describe this role"
          className="resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
        />
      </label>

      {/* Rank */}
      <label className="flex flex-col gap-1 text-xs font-medium text-white/70">
        Rank *
        <input
          type="number"
          value={rank}
          onChange={(e) => setRank(Number(e.target.value))}
          min={1}
          step={1}
          required
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-white/40"
        />
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
        <p className="mb-2 text-xs text-white/40">
          Pre-filled based on this Discord role&apos;s current permissions —
          freely editable, with no further connection to Discord.
        </p>
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
                  checked={!!permissions[key]}
                  disabled={!callerHas}
                  onChange={(e) =>
                    setPermissions((p) => ({
                      ...p,
                      [key]: e.target.checked,
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

      {(error ?? listError) && (
        <p className="text-xs text-rose-400">{error ?? listError}</p>
      )}
      <CommandFeedback result={result} />

      <div className="flex justify-end gap-3">
        <DialogClose asChild>
          <button
            type="button"
            className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            Cancel
          </button>
        </DialogClose>
        <FormButton theme="black" type="submit" disabled={submitting}>
          Import
        </FormButton>
      </div>
    </form>
  );
}
