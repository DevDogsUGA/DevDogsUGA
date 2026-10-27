"use client";

import { useActionState, useEffect } from "react";
import { allowConsent, cancelConsent } from "~/server/actions/consent";
import { toast } from "~/lib/toast";
import { Button } from "~/ui/button";

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
    <form className="cc-actions">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      {accountId && <input type="hidden" name="accountId" value={accountId} />}
      <Button
        type="submit"
        variant="ghost"
        size="lg"
        formAction={cancelAction}
        loading={cancelling}
        disabled={pending}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        size="lg"
        formAction={allowAction}
        loading={allowing}
        disabled={pending}
      >
        Allow
      </Button>
    </form>
  );
}
