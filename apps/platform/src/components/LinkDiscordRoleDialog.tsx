"use client";

import { useState } from "react";
import { GameControllerIcon, XIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import { Checkbox } from "~/ui/checkbox";
import { CommandFeedback, useCommand } from "~/ui/use-command";
import type { RoleRow } from "~/hooks/useRoles";
import {
  createDiscordRoleFromRole,
  linkRoleToDiscord,
  listImportableDiscordRoles,
} from "~/server/actions/discordRoleSync";
import {
  canManageDiscordRolePosition,
  type DiscordSyncCapability,
} from "~/lib/discordCapability";
import type { ImportableDiscordRole } from "~/server/discord/roleSync";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";

interface Props {
  role: RoleRow;
  callerCapability: DiscordSyncCapability;
}

/**
 * Links a role to a Discord role that exists, or creates one from it. The
 * form is its own component so each opening starts with no stale error.
 */
export default function LinkDiscordRoleDialog({
  role,
  callerCapability,
}: Props) {
  const [open, setOpen] = useState(false);
  const [discordRoles, setDiscordRoles] = useState<ImportableDiscordRole[]>([]);
  const [loading, setLoading] = useState(false);
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
          <Button type="button" variant="outline" size="sm" disabled={!canSync}>
            <GameControllerIcon weight="bold" aria-hidden />
            Link to Discord
          </Button>
        </DialogTrigger>
      </span>

      <DialogContent className="max-w-md" showCloseButton={false}>
        <LinkDiscordRoleForm
          role={role}
          callerCapability={callerCapability}
          discordRoles={discordRoles}
          loading={loading}
          listError={listError}
          onLinked={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LinkDiscordRoleForm({
  role,
  callerCapability,
  discordRoles,
  loading,
  listError,
  onLinked,
}: Props & {
  discordRoles: ImportableDiscordRole[];
  loading: boolean;
  listError: string | null;
  onLinked: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const {
    run,
    pending: submitting,
    result,
  } = useCommand(async (existing: boolean, discordRoleId: string) => {
    const outcome = existing
      ? await linkRoleToDiscord(role.id, discordRoleId)
      : await createDiscordRoleFromRole(role.id);
    if (outcome.ok) onLinked();
    return outcome;
  });
  const canCreateNew = canManageDiscordRolePosition(callerCapability, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "existing" && !selectedId) {
      setError("Select a Discord role to link.");
      return;
    }
    setError(null);
    run(mode === "existing", selectedId);
  }

  return (
    <form onSubmit={handleSubmit} className="con-stack">
      <DialogHeader className="flex-row items-center justify-between">
        <DialogTitle>Link &ldquo;{role.title}&rdquo; to Discord</DialogTitle>
        <DialogClose className="iconbtn" aria-label="Close">
          <XIcon weight="bold" aria-hidden />
        </DialogClose>
      </DialogHeader>

      <fieldset className="con-checks">
        <legend className="sr-only">How to link</legend>
        <Checkbox
          type="radio"
          name="mode"
          checked={mode === "existing"}
          onChange={() => setMode("existing")}
          label="Link to an existing Discord role"
        />
        {mode === "existing" && (
          <span className="input select">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loading}
              aria-label="Discord role"
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
          </span>
        )}

        <span
          title={
            canCreateNew
              ? undefined
              : "Your Discord account doesn't have permission to create Discord roles."
          }
        >
          <Checkbox
            type="radio"
            name="mode"
            checked={mode === "new"}
            onChange={() => setMode("new")}
            disabled={!canCreateNew}
            label="Create a new Discord role from this role"
          />
        </span>
      </fieldset>

      <p className="small muted" style={{ margin: 0 }}>
        Name, color and membership will sync with Discord going forward. Current
        holders keep the role; those with a known Discord account are granted it
        on Discord, and anyone else is granted it once they link.
      </p>

      {(error ?? listError) && (
        <Callout tone="critical" alert>
          {error ?? listError}
        </Callout>
      )}
      <CommandFeedback result={result} />

      <div
        className="acts"
        style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}
      >
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          loading={submitting}
          disabled={
            submitting ||
            loading ||
            (mode === "existing" && !selectedId) ||
            (mode === "new" && !canCreateNew)
          }
        >
          Link
        </Button>
      </div>
    </form>
  );
}
