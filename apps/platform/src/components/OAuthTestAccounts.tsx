"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { PencilSimpleIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import {
  deleteTestAccount,
  type TestAccount,
} from "~/server/actions/testAccounts";
import TestAccountDialog from "./TestAccountDialog";
import { toast } from "~/lib/toast";

const MAX_TEST_ACCOUNTS = 5;

interface Props {
  initialAccounts: TestAccount[];
}

export default function OAuthTestAccounts({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState<TestAccount[]>(initialAccounts);
  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<TestAccount | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteTestAccount,
    onSuccess: (_, authUserId) => {
      setAccounts((prev) => prev.filter((a) => a.userId !== authUserId));
      toast.success("Test account deleted");
    },
    onError: () => toast.error("Failed to delete test account"),
  });

  const handleAdded = useCallback((account: TestAccount) => {
    setAccounts((prev) => [...prev, account]);
  }, []);

  const handleUpdated = useCallback((account: TestAccount) => {
    setAccounts((prev) =>
      prev.map((a) => (a.userId === account.userId ? account : a)),
    );
  }, []);

  const atLimit = accounts.length >= MAX_TEST_ACCOUNTS;

  return (
    <>
      {!atLimit && (
        <button
          type="button"
          className="mb-3 flex items-center gap-1.5 text-sm text-mauve-400 hover:text-white"
          onClick={() => setAddOpen(true)}
        >
          <PlusCircleIcon />
          Add test account
        </button>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-mauve-400">
          No test accounts yet.{" "}
          <button
            type="button"
            className="text-white underline hover:text-mauve-300"
            onClick={() => setAddOpen(true)}
          >
            Add one
          </button>{" "}
          to use during authorization.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/10">
          {accounts.map((account) => (
            <li
              key={account.userId}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-white">
                  {account.displayName}
                </span>
                <span className="truncate font-mono text-xs text-mauve-400">
                  {account.userId}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rounded-sm p-1.5 text-mauve-400 hover:bg-white/10 hover:text-white"
                  onClick={() => setEditAccount(account)}
                  aria-label={`Edit ${account.displayName}`}
                >
                  <PencilSimpleIcon />
                </button>
                <button
                  type="button"
                  className="rounded-sm p-1.5 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => deleteMutation.mutate(account.userId)}
                  disabled={
                    deleteMutation.isPending &&
                    deleteMutation.variables === account.userId
                  }
                  aria-label={`Delete ${account.displayName}`}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-mauve-400">
        {accounts.length}/{MAX_TEST_ACCOUNTS} test accounts &nbsp;·&nbsp;
        Selected during authorization
      </p>

      <TestAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleAdded}
      />
      {editAccount && (
        <TestAccountDialog
          account={editAccount}
          open={editAccount !== null}
          onOpenChange={(o) => {
            if (!o) setEditAccount(null);
          }}
          onSuccess={handleUpdated}
        />
      )}
    </>
  );
}
