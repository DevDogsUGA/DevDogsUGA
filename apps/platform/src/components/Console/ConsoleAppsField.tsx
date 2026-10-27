"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import FormButton from "~/components/FormButton";
import OAuthClientSheet from "~/components/Settings/OAuthClientSheet";
import oauthAction from "~/server/actions/oauth";
import { toast } from "~/lib/toast";
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
 * the consent switch appears only on DevDogs apps.
 */
export default function ConsoleAppsField({ apps }: { apps: ConsoleApp[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // DevDogs apps have no owner, so their redirects, secret, details and
  // deletion are edited here, in the same drawer a member uses for their own.
  const [openId, setOpenId] = useState<string | null>(null);
  const [{ clientId: mintedClientId, clientSecret }, dispatch, isPending] =
    useActionState(oauthAction, { clientId: null, clientSecret: null });
  const prevPending = useRef(false);
  useEffect(() => {
    if (prevPending.current && !isPending) router.refresh();
    prevPending.current = isPending;
  }, [isPending, router]);
  const openApp = apps.find((a) => a.clientId === openId && a.isDevDogs);
  const revealed = mintedClientId === openApp?.clientId ? clientSecret : null;
  // What the last action on each app did, kept on screen after the toast goes.
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function run(app: ConsoleApp, work: () => Promise<string>) {
    setBusy(app.clientId);
    try {
      const message = await work();
      setNotes((prev) => ({ ...prev, [app.clientId]: message }));
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

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
    <>
      <div className="set-rows" role="list">
        {apps.map((app) => {
          const published = app.status === "in_production";
          const working = busy === app.clientId;
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
                  <FormButton
                    theme="black"
                    size="sm"
                    type="button"
                    onClick={() => setOpenId(app.clientId)}
                    aria-label={`Edit ${app.label}`}
                  >
                    Edit
                  </FormButton>
                )}
                {app.isDevDogs && (
                  <div className="row small" style={{ gap: 8 }}>
                    Skips consent
                    <form
                      action={() =>
                        run(app, async () => {
                          await setAsksForConsent(
                            app.clientId,
                            !app.asksForConsent,
                          );
                          return app.asksForConsent
                            ? `${app.label} no longer asks for consent`
                            : `${app.label} asks for consent again`;
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
                  <form
                    action={() =>
                      run(app, async () => {
                        await setStatus(app.clientId, "in_production");
                        return `${app.label} is in production`;
                      })
                    }
                    title={
                      app.missing.length > 0
                        ? `Before publishing, add ${app.missing.join(", ")}`
                        : undefined
                    }
                  >
                    <FormButton
                      theme="cyan"
                      size="sm"
                      type="submit"
                      disabled={app.missing.length > 0 || working}
                      aria-label={`Publish ${app.label}`}
                    >
                      Publish
                    </FormButton>
                  </form>
                )}
                {!published && app.missing.length > 0 && (
                  <span className="small muted">
                    Needs {app.missing.join(", ")}
                  </span>
                )}

                {published && (
                  <ConfirmDestructiveAction
                    action={() =>
                      run(app, async () => {
                        const result = await setStatus(app.clientId, "testing");
                        return result.counts
                          ? `${app.label} is back in Testing. ${countsMessage(result.counts)}`
                          : `${app.label} is back in Testing`;
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
                      run(app, async () => {
                        await transferToDevDogs(app.clientId);
                        return `${app.label} is now a DevDogs app`;
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
              {notes[app.clientId] && (
                <p
                  role="status"
                  className="small muted"
                  style={{ width: "100%" }}
                >
                  {notes[app.clientId]}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <OAuthClientSheet
        client={openApp ? { ...openApp, approvedTestAccountIds: [] } : null}
        testAccounts={[]}
        dispatch={dispatch}
        isPending={isPending}
        secret={revealed}
        onClose={() => setOpenId(null)}
        devDogsApp
      />
    </>
  );
}
