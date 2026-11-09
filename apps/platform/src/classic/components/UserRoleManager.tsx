"use client";

import { useCallback, useRef, useState } from "react";
import {
  MagnifyingGlassIcon,
  XIcon,
  CaretDownIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react/ssr";
import {
  searchUsers,
  assignRoleToUser,
  removeRoleFromUser,
  type UserSearchResult,
} from "~/server/actions/permissions";
import {
  canManageDiscordRolePosition,
  type DiscordSyncCapability,
} from "~/lib/discordCapability";
import type { RoleRow } from "~/hooks/useRoles";
import UserPermissionsPanel from "./UserPermissionsPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "~/classic/ui/alert-dialog";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";

interface Props {
  roles: RoleRow[];
  callerMinRank: number;
  callerCapability: DiscordSyncCapability;
}

function useDebounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
) {
  // Ref so the pending timer survives re-renders (a plain `let` would reset
  // every render, defeating the debounce).
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  return useCallback(
    (...args: Parameters<T>) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay],
  );
}

export default function UserRoleManager({
  roles,
  callerMinRank,
  callerCapability,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inspectingId, setInspectingId] = useState<string | null>(null);

  const delegatableRoles = roles.filter((r) => r.rank > callerMinRank);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const users = await searchUsers(q);
      setResults(users);
    } finally {
      setSearching(false);
    }
  }, []);

  const debouncedSearch = useDebounce((q: string) => {
    void doSearch(q);
  }, 300);

  function handleQueryChange(q: string) {
    setQuery(q);
    debouncedSearch(q);
  }

  const assign = useCommand(async (userId: string, roleId: string) => {
    const result = await assignRoleToUser(userId, roleId);
    if (result.ok) {
      // Optimistically update results
      setResults((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          const role = roles.find((r) => r.id === roleId);
          if (!role) return u;
          return {
            ...u,
            roles: [
              ...u.roles,
              {
                id: role.id,
                title: role.title,
                color: role.color,
                rank: role.rank,
                discordRoleId: role.discordRoleId,
              },
            ].sort((a, b) => a.rank - b.rank),
          };
        }),
      );
    }
    return result;
  });

  const remove = useCommand(async (userId: string, roleId: string) => {
    const result = await removeRoleFromUser(userId, roleId);
    if (result.ok) {
      setResults((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, roles: u.roles.filter((r) => r.id !== roleId) }
            : u,
        ),
      );
    }
    return result;
  });
  const isPending = assign.pending || remove.pending;

  const [removing, setRemoving] = useState<{
    userId: string;
    roleId: string;
    userName: string;
    roleTitle: string;
  } | null>(null);

  return (
    <section className="mx-auto w-full max-w-3xl">
      <h3 className="mb-4 text-lg font-semibold text-white">
        Assign Roles to Users
      </h3>

      {/* Search */}
      <div className="relative mb-4">
        <MagnifyingGlassIcon
          className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/40"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search for a member by name"
          className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pr-4 pl-9 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
        />
        {searching && (
          <SpinnerGapIcon
            className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-white/40"
            aria-hidden
          />
        )}
      </div>

      <CommandFeedback result={assign.result} />
      <CommandFeedback result={remove.result} />

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-3">
          {results.map((user) => {
            const assignedIds = new Set(user.roles.map((r) => r.id));
            const addableRoles = delegatableRoles.filter(
              (r) => !assignedIds.has(r.id),
            );
            const disabledRoleReasons = new Map<string, string>();
            const pendingLinkRoleIds = new Set<string>();
            for (const r of addableRoles) {
              if (r.discordRoleId === null) continue;
              if (!user.hasDiscordLinked) pendingLinkRoleIds.add(r.id);
              if (
                !canManageDiscordRolePosition(
                  callerCapability,
                  r.discordRolePosition ?? Infinity,
                )
              )
                disabledRoleReasons.set(r.id, " (above your Discord roles)");
            }
            const isInspecting = inspectingId === user.id;

            return (
              <div
                key={user.id}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  {/* User info */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-white">
                      {user.preferredName}
                    </span>
                    <span className="truncate text-xs text-white/50">
                      {user.email}
                    </span>
                  </div>

                  {/* Inspect button */}
                  <button
                    onClick={() =>
                      setInspectingId(isInspecting ? null : user.id)
                    }
                    className="flex items-center gap-1 rounded-lg border border-white/20 px-2.5 py-1 text-xs text-white/60 transition hover:bg-white/10"
                  >
                    {isInspecting ? (
                      <XIcon className="h-3 w-3" aria-hidden />
                    ) : (
                      <CaretDownIcon className="h-3 w-3" aria-hidden />
                    )}
                    Inspect
                  </button>
                </div>

                {/* Assigned role badges */}
                {user.roles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {user.roles.map((role) => {
                      const canRemove = role.rank > callerMinRank;
                      return (
                        <span
                          key={role.id}
                          className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                          style={{
                            backgroundColor: (role.color ?? "#818cf8") + "22",
                            borderColor: role.color ?? "#818cf8",
                            borderWidth: 1,
                          }}
                        >
                          {role.title}
                          {canRemove && (
                            <button
                              onClick={() =>
                                setRemoving({
                                  userId: user.id,
                                  roleId: role.id,
                                  userName: user.preferredName,
                                  roleTitle: role.title,
                                })
                              }
                              disabled={isPending}
                              className="ml-0.5 rounded-full text-white/60 hover:text-white disabled:opacity-50"
                              aria-label={`Remove ${role.title}`}
                            >
                              <XIcon className="h-2.5 w-2.5" aria-hidden />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Add role dropdown */}
                {addableRoles.length > 0 && (
                  <div className="mt-3">
                    <RoleDropdown
                      roles={addableRoles}
                      disabledRoleReasons={disabledRoleReasons}
                      pendingLinkRoleIds={pendingLinkRoleIds}
                      onSelect={(roleId) => assign.run(user.id, roleId)}
                      disabled={isPending}
                    />
                  </div>
                )}

                {/* Permissions panel */}
                {isInspecting && <UserPermissionsPanel userId={user.id} />}
              </div>
            );
          })}
        </div>
      )}

      {!searching && query.trim() && results.length === 0 && (
        <p className="text-center text-sm text-white/40">
          No users found for &ldquo;{query}&rdquo;.
        </p>
      )}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            Remove {removing?.roleTitle} from {removing?.userName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            They lose what the role allows straight away. If the role is synced
            with Discord, it is taken off them there too. The change is written
            to the audit log.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (removing) remove.run(removing.userId, removing.roleId);
                setRemoving(null);
              }}
            >
              Remove role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function RoleDropdown({
  roles,
  disabledRoleReasons,
  pendingLinkRoleIds,
  onSelect,
  disabled,
}: {
  roles: RoleRow[];
  disabledRoleReasons: Map<string, string>;
  pendingLinkRoleIds: Set<string>;
  onSelect: (roleId: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) return;
    setValue("");
    onSelect(id);
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={disabled}
      aria-label="Add a role"
      className="rounded-lg border border-white/20 bg-white/10 px-3 py-1 text-xs text-white outline-none focus:border-white/40 disabled:opacity-50"
    >
      <option value="">+ Add role…</option>
      {roles.map((r) => (
        <option
          key={r.id}
          value={r.id}
          disabled={disabledRoleReasons.has(r.id)}
        >
          {r.title}
          {disabledRoleReasons.get(r.id) ??
            (pendingLinkRoleIds.has(r.id) ? " (pending Discord link)" : "")}
        </option>
      ))}
    </select>
  );
}
