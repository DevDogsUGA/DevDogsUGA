"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GameControllerIcon, XIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
import type { RoleRow } from "~/hooks/useRoles";
import {
  countUsersWithoutLinkedDiscord,
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

export default function LinkDiscordRoleDialog({
  role,
  callerCapability,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [discordRoles, setDiscordRoles] = useState<ImportableDiscordRole[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSync =
    callerCapability.linked &&
    (callerCapability.isOwner || callerCapability.hasManageRoles);
  const triggerDisabledReason = !callerCapability.linked
    ? "Link your Discord account to use Discord sync."
    : !canSync
      ? "Your Discord account needs the Manage Roles permission."
      : null;
  const canCreateNew = canManageDiscordRolePosition(callerCapability, 0);

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) return;

    setMode("existing");
    setSelectedId("");
    setMemberCount(null);
    setError(null);
    setLoading(true);
    Promise.all([
      listImportableDiscordRoles(),
      countUsersWithoutLinkedDiscord(role.id),
    ])
      .then(([roles, count]) => {
        setDiscordRoles(roles);
        setMemberCount(count);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "existing" && !selectedId) {
      setError("Select a Discord role to link.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      if (mode === "existing") {
        await linkRoleToDiscord(role.id, selectedId);
      } else {
        await createDiscordRoleFromRole(role.id);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <span title={triggerDisabledReason ?? undefined}>
        <DialogTrigger asChild disabled={!canSync}>
          <button
            disabled={!canSync}
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/5"
          >
            <GameControllerIcon aria-hidden />
            Link to Discord
          </button>
        </DialogTrigger>
      </span>

      <DialogContent
        className="max-w-md border-white/20 bg-mauve-900 p-0 shadow-2xl"
        showCloseButton={false}
      >
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 px-5 py-6"
        >
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle className="text-base font-semibold text-white">
              Link &ldquo;{role.title}&rdquo; to Discord
            </DialogTitle>
            <DialogClose className="rounded-sm p-1 text-white/40 transition outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/50">
              <XIcon aria-hidden />
            </DialogClose>
          </DialogHeader>

            <fieldset className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-white/80">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "existing"}
                  onChange={() => setMode("existing")}
                  className="accent-indigo-400"
                />
                Link to an existing Discord role
              </label>
              {mode === "existing" && (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  disabled={loading}
                  className="ml-5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-white/40"
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
              )}

              <label
                className={[
                  "flex items-center gap-2 text-xs",
                  canCreateNew
                    ? "cursor-pointer text-white/80"
                    : "cursor-not-allowed text-white/30",
                ].join(" ")}
                title={
                  canCreateNew
                    ? undefined
                    : "Your Discord account doesn't have permission to create Discord roles."
                }
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "new"}
                  onChange={() => setMode("new")}
                  disabled={!canCreateNew}
                  className="accent-indigo-400"
                />
                Create a new Discord role from this role
              </label>
            </fieldset>

            <p className="text-xs text-white/60">
              Name and color will sync with Discord going forward, and only
              members with a linked Discord account can be assigned this role.
              {memberCount !== null && memberCount > 0 && (
                <>
                  {" "}
                  <strong className="text-amber-300">
                    {memberCount} member{memberCount === 1 ? "" : "s"} without a
                    linked Discord account currently{" "}
                    {memberCount === 1 ? "has" : "have"} this role and will lose
                    it.
                  </strong>
                </>
              )}
            </p>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <div className="flex justify-end gap-3">
              <DialogClose asChild>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/10"
                >
                  Cancel
                </button>
              </DialogClose>
              <FormButton
                theme="black"
                type="submit"
                disabled={
                  submitting ||
                  loading ||
                  (mode === "existing" && !selectedId) ||
                  (mode === "new" && !canCreateNew)
                }
              >
                Link
              </FormButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
  );
}
