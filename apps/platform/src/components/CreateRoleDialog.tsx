"use client";

import { useState } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
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
  canManageFeedback: "Manage site feedback",
  canCreateCredentials: "Create credentials",
  canManageVerification: "Manage verification",
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
    } as CreateRoleInput);

    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border-2 border-indigo-400 bg-indigo-500/20 px-4 py-1.5 text-sm font-medium text-white transition outline-none hover:bg-indigo-500/40 focus-visible:ring-2 focus-visible:ring-indigo-400">
          <PlusIcon aria-hidden />
          New Role
        </button>
      </DialogTrigger>

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
              New Role
            </DialogTitle>
            <DialogClose className="rounded-sm p-1 text-white/40 transition outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/50">
              <XIcon aria-hidden />
            </DialogClose>
          </DialogHeader>

            {/* Title */}
            <label className="flex flex-col gap-1 text-xs font-medium text-white/70">
              Title *
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Social Media Manager"
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
              />
            </label>

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

            {/* Color + Rank */}
            <div className="flex gap-4">
              <label className="flex items-center gap-3 text-xs font-medium text-white/70">
                Color
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-white/70">
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
            </div>

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
              <FormButton theme="black" type="submit" disabled={isPending}>
                Create
              </FormButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
  );
}
