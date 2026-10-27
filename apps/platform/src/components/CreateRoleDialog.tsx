"use client";

import { useState } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import { Checkbox } from "~/ui/checkbox";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import type {
  CreateRoleInput,
  ResolvedPermissions,
} from "~/server/actions/permissions";
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
  isPending: boolean;
  onCreate: (data: CreateRoleInput) => void;
}

export default function CreateRoleDialog({
  nextRank,
  callerPermissions,
  isPending,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#818cf8");
  const [rank, setRank] = useState(nextRank);
  const [showOnProfile, setShowOnProfile] = useState(true);
  const [isLeadership, setIsLeadership] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  function handleOpen(v: boolean) {
    setOpen(v);
    if (v) {
      setTitle("");
      setDescription("");
      setColor("#818cf8");
      setRank(nextRank);
      setShowOnProfile(true);
      setIsLeadership(false);
      setPermissions({});
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);

    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      rank,
      color,
      showOnProfile,
      isLeadership,
      ...Object.fromEntries(
        PERMISSION_KEYS.map((k) => [k, permissions[k] ? true : null]),
      ),
    });

    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <PlusIcon weight="bold" aria-hidden />
          Create role
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md" showCloseButton={false}>
        <form onSubmit={handleSubmit} className="con-stack">
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle>Create role</DialogTitle>
            <DialogClose className="iconbtn" aria-label="Close">
              <XIcon weight="bold" aria-hidden />
            </DialogClose>
          </DialogHeader>
          <p className="small muted" style={{ margin: 0 }}>
            Starts at rank {nextRank}, with no permissions.
          </p>

          <Field label="Title" htmlFor="new-role-title" required>
            <Input
              id="new-role-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Social Media Manager"
            />
          </Field>

          <Field label="Description" htmlFor="new-role-desc">
            <Textarea
              id="new-role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional. Briefly describe this role."
            />
          </Field>

          <div className="con-fields">
            <label className="con-color">
              <span className="label">Color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <code className="con-code">{color}</code>
            </label>
            <Field label="Rank" htmlFor="new-role-rank" required>
              <Input
                id="new-role-rank"
                type="number"
                value={rank}
                onChange={(e) => setRank(Number(e.target.value))}
                min={1}
                step={1}
                required
              />
            </Field>
          </div>

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
            <Button type="submit" disabled={isPending} loading={isPending}>
              Create role
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
