"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Button } from "~/ui/button";
import { toast } from "~/lib/toast";
import { cn } from "~/lib/cn";
import TestAccountDialog from "~/components/TestAccountDialog";
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
      <div>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>
          Choose an account
        </h1>
        <p className="help" style={{ marginTop: 8 }}>
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
          <div
            role="radiogroup"
            aria-label="Account"
            className="card flat cc-pick-list"
          >
            {options.map((account) => {
              const on = selected === account.userId;
              return (
                <button
                  key={account.userId}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={cn("set-hopt w-full text-left", on && "sel")}
                  onClick={() => setSelected(account.userId)}
                  disabled={isPending}
                >
                  <span className={cn("check radio", on && "on")} aria-hidden>
                    <i />
                  </span>
                  <span className="min-w-0">
                    <b className="truncate">{account.displayName}</b>
                  </span>
                </button>
              );
            })}
          </div>

          {accounts.length < 5 && (
            <button
              type="button"
              className="textlink self-start"
              onClick={() => setAddOpen(true)}
              disabled={isPending}
            >
              + Add a test account
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isPending}
          >
            Continue
          </Button>
          <Button
            type="submit"
            variant="ghost"
            formAction={denyAction}
            className="w-full"
            loading={denying}
            disabled={isPending}
          >
            Cancel
          </Button>
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
