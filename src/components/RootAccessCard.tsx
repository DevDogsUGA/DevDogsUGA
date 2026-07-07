"use client";

import { useCallback, useState, useTransition } from "react";
import { SpinnerGapIcon, MagnifyingGlassIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";
import {
  searchUsers,
  transferRootRole,
  type UserSearchResult,
} from "~/server/actions/permissions";
import type { RootHolder } from "~/server/loaders/permissions";

interface Props {
  rootHolder: RootHolder | null;
  isRootHolder: boolean;
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

export default function RootAccessCard({ rootHolder, isRootHolder }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const users = await searchUsers(q);
        setResults(users.filter((u) => u.id !== rootHolder?.id));
      } finally {
        setSearching(false);
      }
    },
    [rootHolder?.id],
  );

  const debouncedSearch = useDebounce((q: string) => {
    void doSearch(q);
  }, 300);

  function handleQueryChange(q: string) {
    setQuery(q);
    debouncedSearch(q);
  }

  function handleTransfer(targetUserId: string) {
    startTransition(async () => {
      await transferRootRole(targetUserId);
      setQuery("");
      setResults([]);
      router.refresh();
    });
  }

  return (
    <section className="mx-auto w-full max-w-3xl">
      <h3 className="mb-4 text-lg font-semibold text-white">Root Access</h3>

      <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <ShieldCheckIcon
          className="h-5 w-5 shrink-0 text-amber-400"
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {rootHolder ? (
            <>
              <span className="truncate text-sm font-semibold text-white">
                {rootHolder.preferredName}
                {isRootHolder && " (you)"}
              </span>
              <span className="truncate text-xs text-white/50">
                {rootHolder.email}
              </span>
            </>
          ) : (
            <span className="text-sm text-white/50">Unassigned</span>
          )}
        </div>
      </div>

      {isRootHolder && (
        <>
          <div className="relative mb-4">
            <MagnifyingGlassIcon
              className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/40"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search by name to transfer Root…"
              className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pr-4 pl-9 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
            />
            {searching && (
              <SpinnerGapIcon
                className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-white/40"
                aria-hidden
              />
            )}
          </div>

          {results.length > 0 && (
            <div className="flex flex-col gap-3">
              {results.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-white">
                      {user.preferredName}
                    </span>
                    <span className="truncate text-xs text-white/50">
                      {user.email}
                    </span>
                  </div>

                  <ConfirmDestructiveAction
                    title="Transfer Root access"
                    description={
                      <>
                        This will immediately transfer the Root role to{" "}
                        <strong>{user.preferredName}</strong> and revoke it from
                        you. Only the new Root holder can transfer it back.
                      </>
                    }
                    action={async () => handleTransfer(user.id)}
                    submitLabel="Transfer"
                    userConfirmText={user.preferredName}
                  >
                    <FormButton
                      theme="rose"
                      type="submit"
                      disabled={isPending}
                      className="text-xs"
                    >
                      Transfer Root
                    </FormButton>
                  </ConfirmDestructiveAction>
                </div>
              ))}
            </div>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <p className="text-center text-sm text-white/40">
              No users found for &ldquo;{query}&rdquo;.
            </p>
          )}
        </>
      )}
    </section>
  );
}
