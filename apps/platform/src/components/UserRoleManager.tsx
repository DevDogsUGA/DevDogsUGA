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
import UserPermissionsPanel, { RoleChip } from "./UserPermissionsPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "~/ui/alert-dialog";
import { Button } from "~/ui/button";
import { CommandFeedback, useCommand } from "~/ui/use-command";

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
    <div>
      <div className="input con-search">
        <MagnifyingGlassIcon aria-hidden />
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search for a member by name"
          type="search"
        />
        {searching && <SpinnerGapIcon className="animate-spin" aria-hidden />}
      </div>

      <CommandFeedback result={assign.result} />
      <CommandFeedback result={remove.result} />

      {results.length > 0 && (
        <ul className="con-people">
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
              <li key={user.id}>
                <div className="con-person">
                  <div>
                    <b>{user.preferredName}</b>
                    <span className="small muted">{user.email}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={isInspecting}
                    onClick={() =>
                      setInspectingId(isInspecting ? null : user.id)
                    }
                  >
                    {isInspecting ? (
                      <XIcon weight="bold" aria-hidden />
                    ) : (
                      <CaretDownIcon weight="bold" aria-hidden />
                    )}
                    Inspect
                  </Button>
                </div>

                {user.roles.length > 0 ? (
                  <div className="con-roles">
                    {user.roles.map((role) => {
                      const canRemove = role.rank > callerMinRank;
                      return (
                        <RoleChip key={role.id} color={role.color}>
                          {role.title}
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() =>
                                setRemoving({
                                  userId: user.id,
                                  roleId: role.id,
                                  userName: user.preferredName,
                                  roleTitle: role.title,
                                })
                              }
                              disabled={isPending}
                              aria-label={`Remove ${role.title}`}
                            >
                              <XIcon weight="bold" aria-hidden />
                            </button>
                          )}
                        </RoleChip>
                      );
                    })}
                  </div>
                ) : (
                  <p className="small muted" style={{ margin: "8px 0 0" }}>
                    No roles.
                  </p>
                )}

                {isInspecting && <UserPermissionsPanel userId={user.id} />}

                {addableRoles.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <RoleDropdown
                      roles={addableRoles}
                      disabledRoleReasons={disabledRoleReasons}
                      pendingLinkRoleIds={pendingLinkRoleIds}
                      onSelect={(roleId) => assign.run(user.id, roleId)}
                      disabled={isPending}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!searching && query.trim() && results.length === 0 && (
        <p className="small muted" style={{ textAlign: "center" }}>
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
              variant="danger-solid"
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
    </div>
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
    <span className="input select con-add-role">
      <select
        value={value}
        onChange={handleChange}
        disabled={disabled}
        aria-label="Add a role"
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
    </span>
  );
}
