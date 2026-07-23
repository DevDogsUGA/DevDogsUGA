"use client";

import { useCallback, useState, useTransition } from "react";
import { MagnifyingGlassIcon, XIcon, CaretDownIcon, SpinnerGapIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
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

interface Props {
  roles: RoleRow[];
  callerMinRank: number;
  callerCapability: DiscordSyncCapability;
}

function useDebounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
) {
  let timer: ReturnType<typeof setTimeout>;
  return useCallback(
    (...args: Parameters<T>) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, delay],
  );
}

export default function UserRoleManager({
  roles,
  callerMinRank,
  callerCapability,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  function handleAssign(userId: string, roleId: string) {
    startTransition(async () => {
      await assignRoleToUser(userId, roleId);
      router.refresh();
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
    });
  }

  function handleRemove(userId: string, roleId: string) {
    startTransition(async () => {
      await removeRoleFromUser(userId, roleId);
      router.refresh();
      setResults((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, roles: u.roles.filter((r) => r.id !== roleId) }
            : u,
        ),
      );
    });
  }

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
          className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pr-4 pl-9 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
        />
        {searching && (
          <SpinnerGapIcon
            className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-white/40"
            aria-hidden
          />
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-3">
          {results.map((user) => {
            const assignedIds = new Set(user.roles.map((r) => r.id));
            const addableRoles = delegatableRoles.filter(
              (r) => !assignedIds.has(r.id),
            );
            const disabledRoleReasons = new Map<string, string>();
            for (const r of addableRoles) {
              if (r.discordRoleId === null) continue;
              if (!user.hasDiscordLinked)
                disabledRoleReasons.set(r.id, " (requires Discord)");
              else if (
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
                              onClick={() => handleRemove(user.id, role.id)}
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
                      onSelect={(roleId) => handleAssign(user.id, roleId)}
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
    </section>
  );
}

function RoleDropdown({
  roles,
  disabledRoleReasons,
  onSelect,
  disabled,
}: {
  roles: RoleRow[];
  disabledRoleReasons: Map<string, string>;
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
          {disabledRoleReasons.get(r.id) ?? ""}
        </option>
      ))}
    </select>
  );
}
