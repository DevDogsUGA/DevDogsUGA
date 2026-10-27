"use client";

import { useRouter } from "next/navigation";
import { toast } from "~/lib/toast";
import { forgetApproval } from "~/server/actions/oauthStatus";
import type { ConnectedApp } from "~/server/loaders/oauthApps";
import { logoLetter } from "~/server/oauth/consentScreen";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import EmptyState from "~/ui/empty-state";
import FormButton from "~/components/FormButton";

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
  const router = useRouter();

  if (apps.length === 0) {
    return (
      <EmptyState
        image={false}
        title="No connected apps"
        description="Apps you approve to sign in with DevDogs appear here."
      />
    );
  }

  async function remove(app: ConnectedApp) {
    try {
      await forgetApproval(app.clientId, userId);
      toast.success(`${app.label} can no longer sign you in`);
      router.refresh();
    } catch {
      toast.error("Failed to remove access");
    }
  }

  return (
    <div className="set-rows" role="list">
      {apps.map((app) => (
        <div role="listitem" key={app.clientId} className="arow">
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
                className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--surface-2,var(--bg))] font-semibold"
              >
                {logoLetter(app.label)}
              </span>
            )}
            <div className="min-w-0">
              <b className="truncate">{app.label}</b>
              <span className="small muted">
                Approved{" "}
                <time dateTime={app.approvedAt}>
                  {APPROVED.format(new Date(app.approvedAt))}
                </time>
              </span>
            </div>
          </div>
          <div className="end shrink-0">
            <ConfirmDestructiveAction
              action={() => remove(app)}
              title={`Remove access for ${app.label}?`}
              description="You will be signed out of this app and it can no longer sign you in. Signing in again asks for your approval first."
              submitLabel="Remove access"
            >
              <FormButton
                theme="rose"
                variant="destructive"
                size="sm"
                type="submit"
                aria-label={`Remove access for ${app.label}`}
              >
                Remove access
              </FormButton>
            </ConfirmDestructiveAction>
          </div>
        </div>
      ))}
    </div>
  );
}
