"use client";

import { useCallback, useState } from "react";
import {
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "~/classic/ui/button";
import {
  deleteTestAccount,
  type TestAccount,
} from "~/server/actions/testAccounts";
import TestAccountDialog from "~/classic/components/TestAccountDialog";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";

const MAX_TEST_ACCOUNTS = 5;

interface Props {
  initialAccounts: TestAccount[];
}

export default function OAuthTestAccounts({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState<TestAccount[]>(initialAccounts);
  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<TestAccount | null>(null);

  const handleDeleted = useCallback((userId: string) => {
    setAccounts((prev) => prev.filter((a) => a.userId !== userId));
  }, []);

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
      {accounts.length === 0 ? (
        <div className="rounded-lg border border-mauve-800 px-4 py-6 text-center">
          <p className="text-sm font-medium text-white">No test accounts yet</p>
          <p className="text-sm text-mauve-400">
            Add one to use during authorization.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-mauve-800 rounded-lg border border-mauve-800">
          {accounts.map((account) => (
            <TestAccountRow
              key={account.userId}
              account={account}
              onEdit={() => setEditAccount(account)}
              onDeleted={() => handleDeleted(account.userId)}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!atLimit && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon aria-hidden />
            Create a test account
          </Button>
        )}
        <span className="text-xs text-mauve-400">
          {accounts.length} of {MAX_TEST_ACCOUNTS} test accounts. Selected
          during authorization.
        </span>
      </div>

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

/** One account, with its own Delete Command so a refusal shows on its row. */
function TestAccountRow({
  account,
  onEdit,
  onDeleted,
}: {
  account: TestAccount;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { run, pending, result } = useCommand(async (userId: string) => {
    const outcome = await deleteTestAccount(userId);
    if (outcome.ok) onDeleted();
    return outcome;
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-sm font-medium text-white">
          {account.displayName}
        </b>
        <span className="truncate font-mono text-xs text-mauve-400">
          {account.userId}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-sm p-1.5 text-mauve-300 transition-colors outline-none hover:bg-mauve-800 hover:text-white focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-50"
          onClick={onEdit}
          aria-label={`Edit ${account.displayName}`}
        >
          <PencilSimpleIcon />
        </button>
        <button
          type="button"
          className="rounded-sm p-1.5 text-mauve-300 transition-colors outline-none hover:bg-mauve-800 hover:text-white focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-50"
          onClick={() => run(account.userId)}
          disabled={pending}
          aria-label={`Delete ${account.displayName}`}
        >
          <TrashIcon />
        </button>
      </div>
      <div className="w-full empty:hidden">
        <CommandFeedback result={result} />
      </div>
    </li>
  );
}
