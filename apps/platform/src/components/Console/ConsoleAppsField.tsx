"use client";

import FormButton from "~/components/FormButton";
import { useCommand, CommandFeedback } from "~/ui/use-command";
import { success, type ActionResult } from "~/lib/actionResult";
import {
  setAsksForConsent,
  setStatus,
  transferToDevDogs,
} from "~/server/actions/oauthStatus";
import type { ConsoleApp } from "~/server/loaders/oauthApps";
import { logoLetter } from "~/server/oauth/consentScreen";
import Badge from "~/ui/badge";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import EmptyState from "~/ui/empty-state";
import LinkButton from "~/ui/link-button";
import Toggle from "~/ui/switch";

/** The sentence after a return to Testing: who was signed out. */
export function countsMessage(counts: {
  consents: number;
  sessions: number;
  authorizations: number;
}): string {
  return `Removed ${counts.consents} approvals, ${counts.sessions} sessions and ${counts.authorizations} pending sign-ins`;
}

/**
 * The apps a holder of `canManageOAuthApps` runs: DevDogs apps and members'
 * published ones. Publish is enabled only when the app has a logo, a homepage
 * and a privacy policy. Back to Testing and Transfer to DevDogs confirm first;
 * the consent switch appears only on DevDogs apps. A DevDogs app has no owner,
 * so its redirects, secret, details and deletion are edited on its own page,
 * the same one a member uses for their own app.
 */
export default function ConsoleAppsField({ apps }: { apps: ConsoleApp[] }) {
  if (apps.length === 0) {
    return (
      <EmptyState
        image={false}
        title="No apps to manage"
        description="DevDogs apps and members' apps appear here."
      />
    );
  }

  return (
    <div className="set-rows" role="list">
      {apps.map((app) => (
        <AppRow key={app.clientId} app={app} />
      ))}
    </div>
  );
}

/** Each app owns its command state; confirmation remains composed around it. */
function AppRow({ app }: { app: ConsoleApp }) {
  const {
    run,
    pending: working,
    result,
  } = useCommand((work: () => Promise<ActionResult>) => work());
  const published = app.status === "in_production";
  return (
    <div
      role="listitem"
      key={app.clientId}
      className="arow"
      style={{ flexWrap: "wrap", gap: 12 }}
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
            className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--surface-2,var(--bg))] font-semibold"
          >
            {logoLetter(app.label)}
          </span>
        )}
        <div className="min-w-0">
          <b className="truncate">{app.label}</b>
          <span className="small muted">
            {app.isDevDogs
              ? "DevDogs app"
              : `By ${app.ownerName ?? "a member"}`}
            {" · "}
            {app.approvedMembers} approved
          </span>
        </div>
        <Badge variant={published ? "warning" : "info"}>
          {published ? "In production" : "Testing"}
        </Badge>
      </div>

      <div className="end flex flex-wrap items-center gap-2">
        {app.isDevDogs && (
          <LinkButton
            href={`/dashboard/oauth/${app.clientId}`}
            variant="outline"
            size="sm"
            aria-label={`Edit ${app.label}`}
          >
            Edit
          </LinkButton>
        )}
        {app.isDevDogs && (
          <div className="row small" style={{ gap: 8 }}>
            Skips consent
            <form
              action={() =>
                run(async () => {
                  const result = await setAsksForConsent(
                    app.clientId,
                    !app.asksForConsent,
                  );
                  if (!result.ok) return result;
                  return success(
                    undefined,
                    app.asksForConsent
                      ? `${app.label} no longer asks for consent`
                      : `${app.label} asks for consent again`,
                  );
                })
              }
            >
              <Toggle
                checked={!app.asksForConsent}
                pending={working}
                disabled={!published || working}
                aria-label={`Skip the consent screen for ${app.label}`}
              />
            </form>
          </div>
        )}

        {!published && (
          <ConfirmDestructiveAction
            action={() =>
              run(async () => {
                const result = await setStatus(app.clientId, "in_production");
                if (!result.ok) return result;
                return success(
                  undefined,
                  result.data?.counts
                    ? `${app.label} is in production. ${countsMessage(result.data.counts)}`
                    : `${app.label} is in production`,
                );
              })
            }
            title={`Publish ${app.label}?`}
            description={`Publishing ${app.label} signs out every member who is signed in through its test accounts. They will need to sign in again. The counts are shown when it is done.`}
            submitLabel="Publish"
          >
            <FormButton
              theme="cyan"
              size="sm"
              type="submit"
              disabled={app.missing.length > 0 || working}
              aria-label={`Publish ${app.label}`}
              title={
                app.missing.length > 0
                  ? `Before publishing, add ${app.missing.join(", ")}`
                  : undefined
              }
            >
              Publish
            </FormButton>
          </ConfirmDestructiveAction>
        )}
        {!published && app.missing.length > 0 && (
          <span className="small muted">Needs {app.missing.join(", ")}</span>
        )}

        {published && (
          <ConfirmDestructiveAction
            action={() =>
              run(async () => {
                const result = await setStatus(app.clientId, "testing");
                if (!result.ok) return result;
                return success(
                  undefined,
                  result.data?.counts
                    ? `${app.label} is back in Testing. ${countsMessage(result.data.counts)}`
                    : `${app.label} is back in Testing`,
                );
              })
            }
            title={`Return ${app.label} to Testing?`}
            description={`This signs everyone else out of ${app.label}: ${app.approvedMembers} ${app.approvedMembers === 1 ? "member holds" : "members hold"} an approval now, and their sessions end. ${app.isDevDogs ? "It is a DevDogs app, so nobody can sign in until it is published again." : "Only the owner and their test accounts can sign in until it is published again."} The counts are shown when it is done.`}
            submitLabel="Return to Testing"
          >
            <FormButton
              theme="rose"
              variant="destructive"
              size="sm"
              type="submit"
              disabled={working}
              aria-label={`Return ${app.label} to Testing`}
            >
              Back to Testing…
            </FormButton>
          </ConfirmDestructiveAction>
        )}

        {!app.isDevDogs && (
          <ConfirmDestructiveAction
            action={() =>
              run(async () => {
                const result = await transferToDevDogs(app.clientId);
                if (!result.ok) return result;
                return success(undefined, `${app.label} is now a DevDogs app`);
              })
            }
            title={`Transfer ${app.label} to DevDogs?`}
            description={`${app.ownerName ?? "The owner"} stops owning ${app.label} and loses the ability to manage it; officers manage it from then on. It no longer counts towards their three apps. This cannot be undone.`}
            submitLabel="Transfer to DevDogs"
          >
            <FormButton
              theme="rose"
              variant="destructive"
              size="sm"
              type="submit"
              disabled={working}
              aria-label={`Transfer ${app.label} to DevDogs`}
            >
              Transfer to DevDogs…
            </FormButton>
          </ConfirmDestructiveAction>
        )}
      </div>
      <CommandFeedback result={result} />
    </div>
  );
}
