"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";
import { GameControllerIcon, XIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import { Checkbox } from "~/ui/checkbox";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import type { ResolvedPermissions } from "~/server/actions/permissions";
import {
  importRoleFromDiscord,
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
  nextRank: number;
  callerPermissions: ResolvedPermissions;
  callerCapability: DiscordSyncCapability;
}

export default function ImportDiscordRoleDialog({
  nextRank,
  callerPermissions,
  callerCapability,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [discordRoles, setDiscordRoles] = useState<ImportableDiscordRole[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [description, setDescription] = useState("");
  const [rank, setRank] = useState(nextRank);
  const [showOnProfile, setShowOnProfile] = useState(true);
  const [isLeadership, setIsLeadership] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = discordRoles.find((r) => r.id === selectedId);

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

    setSelectedId("");
    setDescription("");
    setRank(nextRank);
    setShowOnProfile(true);
    setIsLeadership(false);
    setPermissions({});
    setError(null);
    setLoading(true);
    listImportableDiscordRoles()
      .then(setDiscordRoles)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false));
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      setError("Select a Discord role to import.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await importRoleFromDiscord(selectedId, {
        description: description.trim() || undefined,
        rank,
        showOnProfile,
        isLeadership,
        ...Object.fromEntries(
          PERMISSION_KEYS.map((k) => [k, permissions[k] ? true : null]),
        ),
      });
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
          <Button type="button" variant="outline" size="sm" disabled={!canSync}>
            <GameControllerIcon weight="bold" aria-hidden />
            Import from Discord
          </Button>
        </DialogTrigger>
      </span>

      <DialogContent className="max-w-md" showCloseButton={false}>
        <form onSubmit={handleSubmit} className="con-stack con-scroll">
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle>Import from Discord</DialogTitle>
            <DialogClose className="iconbtn" aria-label="Close">
              <XIcon weight="bold" aria-hidden />
            </DialogClose>
          </DialogHeader>

          <Field label="Discord role" htmlFor="import-role" required>
            <span className="input select">
              <select
                id="import-role"
                value={selectedId}
                onChange={(e) => handleSelect(e.target.value)}
                disabled={loading}
                required
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
          </Field>

          {selected && (
            <div className="con-meta">
              <span
                className="con-swatch"
                style={{ "--rc": selected.color ?? "#818cf8" } as CSSProperties}
                aria-hidden
              />
              Name and color are taken from this Discord role and will stay in
              sync going forward.
            </div>
          )}

          <Field label="Description" htmlFor="import-desc">
            <Textarea
              id="import-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional. Briefly describe this role."
            />
          </Field>

          <Field label="Rank" htmlFor="import-rank" required>
            <Input
              id="import-rank"
              type="number"
              value={rank}
              onChange={(e) => setRank(Number(e.target.value))}
              min={1}
              step={1}
              required
            />
          </Field>

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
            <p className="small muted" style={{ margin: "0 0 8px" }}>
              Pre-filled from this Discord role&apos;s current permissions.
              Freely editable, with no further connection to Discord.
            </p>
            <div className="con-perm-edit">
              {PERMISSION_KEYS.map((key) => (
                <Checkbox
                  key={key}
                  checked={!!permissions[key]}
                  disabled={!callerPermissions[key]}
                  onChange={(e) =>
                    setPermissions((p) => ({ ...p, [key]: e.target.checked }))
                  }
                  label={PERMISSION_LABELS[key]}
                />
              ))}
            </div>
          </fieldset>

          {error && (
            <Callout tone="critical" alert>
              {error}
            </Callout>
          )}

          <div
            className="acts"
            style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}
          >
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting} loading={submitting}>
              Import
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
