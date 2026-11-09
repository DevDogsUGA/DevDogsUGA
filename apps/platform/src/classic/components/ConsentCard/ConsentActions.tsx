"use client";

import { useActionState, useEffect } from "react";
import { SpinnerGapIcon } from "@phosphor-icons/react/ssr";
import { allowConsent, cancelConsent } from "~/server/actions/consent";
import { toast } from "~/lib/toast";

interface ConsentActionsProps {
  authorizationId: string;
  /** Testing apps: the account the card is for (the owner or a test account). */
  accountId?: string;
}

/**
 * Allow and Cancel. Allow approves through Supabase Auth's consent flow and
 * sends the member back to the app with a code; Cancel sends them back with
 * `error=access_denied`. Both are the same form with different actions, so the
 * hidden fields are shared.
 */
export default function ConsentActions({
  authorizationId,
  accountId,
}: ConsentActionsProps) {
  const [allowState, allowAction, allowing] = useActionState(
    allowConsent,
    null,
  );
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelConsent,
    null,
  );
  const pending = allowing || cancelling;

  useEffect(() => {
    if (allowState) toast.error(allowState);
  }, [allowState]);
  useEffect(() => {
    if (cancelState) toast.error(cancelState);
  }, [cancelState]);

  return (
    <form className="flex flex-col gap-2">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      {accountId && <input type="hidden" name="accountId" value={accountId} />}
      <button
        type="submit"
        formAction={allowAction}
        className="flex w-full items-center justify-center gap-2 rounded-sm border-2 border-white bg-white px-4 py-2.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pending}
      >
        {allowing && <SpinnerGapIcon className="animate-spin" />}
        Allow
      </button>
      <button
        type="submit"
        formAction={cancelAction}
        className="flex w-full items-center justify-center rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2.5 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pending}
      >
        {cancelling ? <SpinnerGapIcon className="animate-spin" /> : "Cancel"}
      </button>
    </form>
  );
}
