"use client";

import { success } from "~/lib/actionResult";
import { forgetApproval } from "~/server/actions/oauthStatus";
import type { ConnectedApp } from "~/server/loaders/oauthApps";
import { logoLetter } from "~/server/oauth/consentScreen";
import ConfirmDestructiveAction from "~/classic/ui/confirm-destructive-action";
import FormButton from "~/classic/components/FormButton";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";

const APPROVED = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "America/New_York",
});

/**
 * Every app the member has approved, with its logo, name and approval date.
 * Remove access forgets the approval and signs the member out of that one app;
 * nobody else is affected.
 */
export default function ConnectedAppsField({
  apps,
  userId,
}: {
  apps: ConnectedApp[];
  /** The signed-in member: Remove access forgets only their own approval. */
  userId: string;
}) {
  if (apps.length === 0) {
    return (
      <div className="text-sm text-mauve-400">
        <b className="font-medium text-white">No connected apps</b>
        <p>Apps you approve to sign in with DevDogs appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-3" role="list">
      {apps.map((app) => (
        <ConnectedAppRow key={app.clientId} app={app} userId={userId} />
      ))}
    </div>
  );
}

/** Each app owns its Remove access Command; the confirm is composed around it. */
function ConnectedAppRow({
  app,
  userId,
}: {
  app: ConnectedApp;
  userId: string;
}) {
  const { run, pending, result } = useCommand(
    async (clientId: string, memberId: string) => {
      const outcome = await forgetApproval(clientId, memberId);
      return outcome.ok
        ? success(undefined, `${app.label} can no longer sign you in`)
        : outcome;
    },
  );
  return (
    <div
      role="listitem"
      className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-mauve-800 bg-mauve-900 p-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        {app.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.logoUrl}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-md bg-mauve-700 font-semibold text-white"
          >
            {logoLetter(app.label)}
          </span>
        )}
        <div className="min-w-0">
          <b className="block truncate text-sm font-medium text-white">
            {app.label}
          </b>
          <span className="text-xs text-mauve-400">
            Approved{" "}
            <time dateTime={app.approvedAt}>
              {APPROVED.format(new Date(app.approvedAt))}
            </time>
          </span>
        </div>
      </div>
      <div className="shrink-0">
        <ConfirmDestructiveAction
          action={() => run(app.clientId, userId)}
          title={`Remove access for ${app.label}?`}
          description="You will be signed out of this app and it can no longer sign you in. Signing in again asks for your approval first."
          submitLabel="Remove access"
        >
          <FormButton
            theme="rose"
            type="submit"
            className="text-sm"
            disabled={pending}
            aria-label={`Remove access for ${app.label}`}
          >
            Remove access
          </FormButton>
        </ConfirmDestructiveAction>
      </div>
      <CommandFeedback result={result} />
    </div>
  );
}
