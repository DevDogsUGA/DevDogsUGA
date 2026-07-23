"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { SpinnerGapIcon } from "@phosphor-icons/react/ssr";
import { toast } from "~/lib/toast";
import TestAccountDialog from "~/components/TestAccountDialog";
import {
  approveTestAccountAuthorization,
  denyOAuthAuthorization,
} from "~/server/actions/consent";
import type { TestAccount } from "~/server/actions/testAccounts";

interface ConsentFormProps {
  authorizationId: string;
  testAccounts: TestAccount[];
}

export default function ConsentForm({
  authorizationId,
  testAccounts: initialAccounts,
}: ConsentFormProps) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selected, setSelected] = useState<string | null>(
    initialAccounts[0]?.userId ?? null,
  );
  const [addOpen, setAddOpen] = useState(false);

  const [approveState, approveAction, approving] = useActionState(
    approveTestAccountAuthorization,
    null,
  );
  const [denyState, denyAction, denying] = useActionState(
    denyOAuthAuthorization,
    null,
  );

  const isPending = approving || denying;

  useEffect(() => {
    if (approveState) toast.error(approveState);
  }, [approveState]);

  useEffect(() => {
    if (denyState) toast.error(denyState);
  }, [denyState]);

  const handleAccountAdded = useCallback((account: TestAccount) => {
    setAccounts((prev) => [...prev, account]);
    setSelected(account.userId);
    setAddOpen(false);
  }, []);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          Your OAuth client is requesting access
        </h2>
        <p className="mt-1 text-sm text-mauve-700">
          Select a test account to authorize as.
        </p>
      </div>

      <form action={approveAction} className="flex flex-col gap-6">
        <input type="hidden" name="authorizationId" value={authorizationId} />
        {selected && <input type="hidden" name="testUserId" value={selected} />}

        <div className="flex flex-col gap-2">
          {accounts.length === 0 ? (
            <p className="rounded-sm border border-dashed border-mauve-400 px-4 py-6 text-center text-sm text-mauve-500">
              No test accounts yet.{" "}
              <button
                type="button"
                className="text-mauve-700 underline hover:text-mauve-950"
                onClick={() => setAddOpen(true)}
                disabled={isPending}
              >
                Add one
              </button>{" "}
              to continue.
            </p>
          ) : (
            <>
              {accounts.map((account) => (
                <button
                  key={account.userId}
                  type="button"
                  role="radio"
                  aria-checked={selected === account.userId}
                  className="flex items-center gap-3 rounded-sm border px-4 py-3 text-left transition-colors not-aria-checked:border-black not-aria-checked:hover:bg-mauve-50 disabled:cursor-not-allowed disabled:opacity-50 aria-checked:border-cyan-400 aria-checked:bg-cyan-50"
                  onClick={() => setSelected(account.userId)}
                  disabled={isPending}
                >
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-current">
                    {selected === account.userId && (
                      <div className="h-2 w-2 rounded-full bg-current" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {account.displayName}
                    </span>
                  </div>
                </button>
              ))}

              {accounts.length < 5 && (
                <button
                  type="button"
                  className="text-left text-sm text-mauve-500 underline hover:text-mauve-300 disabled:cursor-not-allowed"
                  onClick={() => setAddOpen(true)}
                  disabled={isPending}
                >
                  + Add another test account
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className="hover:shadow-block-md flex w-full items-center justify-center gap-2 rounded-sm border border-black bg-cyan-400 px-4 py-2.5 font-medium text-black shadow-none transition-[translate,box-shadow] hover:-translate-x-1 hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending || !selected}
          >
            {approving && <SpinnerGapIcon className="animate-spin" />}
            Authorize
          </button>
          <button
            type="submit"
            formAction={denyAction}
            className="flex w-full items-center justify-center rounded-sm border border-black bg-white px-4 py-2.5 font-medium text-mauve-700 transition-colors hover:bg-mauve-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
          >
            {denying ? <SpinnerGapIcon className="animate-spin" /> : "Cancel"}
          </button>
        </div>
      </form>

      <TestAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleAccountAdded}
      />
    </div>
  );
}
