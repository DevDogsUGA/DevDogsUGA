"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { SpinnerGapIcon } from "@phosphor-icons/react/ssr";
import { toast } from "~/lib/toast";
import TestAccountDialog from "~/classic/components/TestAccountDialog";
import { cancelConsent } from "~/server/actions/consent";
import type { TestAccount } from "~/server/actions/testAccounts";

interface ConsentFormProps {
  authorizationId: string;
  /** The app's owner, who can always sign in as themselves. */
  self: { userId: string; displayName: string };
  testAccounts: TestAccount[];
}

/**
 * Step one of a Testing app's sign-in: pick the account. Continue is a plain
 * GET back to this page with the pick in the address; the page re-checks it
 * (the owner or one of the owner's test accounts) and shows the consent card
 * for that account, or goes straight back to the app if that account already
 * approved it.
 */
export default function ConsentForm({
  authorizationId,
  self,
  testAccounts: initialAccounts,
}: ConsentFormProps) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selected, setSelected] = useState<string>(self.userId);
  const [addOpen, setAddOpen] = useState(false);

  const [denyState, denyAction, denying] = useActionState(cancelConsent, null);

  const isPending = denying;

  const options = [
    { userId: self.userId, displayName: `${self.displayName} (you)` },
    ...accounts,
  ];

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
        <h1 className="text-xl font-semibold text-white">Choose an account</h1>
        <p className="mt-1 text-sm text-mauve-400">
          Your app is in testing. Choose which account signs in.
        </p>
      </div>

      <form
        method="get"
        action="/oauth/consent"
        className="flex flex-col gap-6"
      >
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <input type="hidden" name="accountId" value={selected} />

        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-label="Account" className="contents">
            {options.map((account) => (
              <button
                key={account.userId}
                type="button"
                role="radio"
                aria-checked={selected === account.userId}
                className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-mauve-400 transition-colors outline-none not-aria-checked:border-white/10 not-aria-checked:bg-white/5 not-aria-checked:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:cursor-not-allowed disabled:opacity-50 aria-checked:border-cyan-400 aria-checked:bg-cyan-400/10 aria-checked:text-cyan-300"
                onClick={() => setSelected(account.userId)}
                disabled={isPending}
              >
                {/* The dot inherits `currentColor` from the row, so the
                    aria-checked text colour above is what turns it cyan. */}
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-current">
                  {selected === account.userId && (
                    <div className="h-2 w-2 rounded-full bg-current" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-white">
                    {account.displayName}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {accounts.length < 5 && (
            <button
              type="button"
              className="rounded-sm text-left text-sm text-mauve-400 underline transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:cursor-not-allowed"
              onClick={() => setAddOpen(true)}
              disabled={isPending}
            >
              + Add a test account
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-sm border-2 border-white bg-white px-4 py-2.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
          >
            Continue
          </button>
          <button
            type="submit"
            formAction={denyAction}
            className="flex w-full items-center justify-center rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2.5 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:cursor-not-allowed disabled:opacity-50"
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
