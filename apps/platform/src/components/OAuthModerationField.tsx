"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import oauthModerationAction, {
  type OAuthModerationState,
} from "~/server/actions/oauthModeration";
import type { ClientModeration } from "~/server/loaders/oauthModeration";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import Select from "~/components/Select";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";

const INITIAL: OAuthModerationState = {
  clientId: null,
  secret: null,
  message: null,
  ok: true,
};

const ACTIONS = [
  ["content.hide", "Hide content"],
  ["content.remove", "Remove content"],
  ["content.restore", "Restore content"],
  ["user.suspend", "Suspend me"],
  ["user.ban", "Ban me"],
  ["user.restore", "Restore me"],
  ["user.delete", "Delete me"],
] as const;

/**
 * Moderation for each OAuth client the member manages (their own, plus every
 * production client for a holder of `canManageOAuthApps`): the signing secret, where
 * decisions are delivered, the sandbox reports their app has filed, and a
 * button that sends a real signed delivery to their endpoint.
 *
 * A development client's reports never reach the moderators; they land here.
 */
export default function OAuthModerationField({
  clients,
}: {
  clients: ClientModeration[];
}) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState(
    oauthModerationAction,
    INITIAL,
  );

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending) router.refresh();
    wasPending.current = isPending;
  }, [isPending, router]);

  if (clients.length === 0) {
    return (
      <p className="help">
        Create an OAuth client above first. Moderation is set up per client.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {clients.map((client) => {
        const mine = state.clientId === client.clientId;
        const showMessage =
          state.message !== null &&
          (mine || (state.clientId === null && !client.production));
        return (
          <div key={client.clientId} className="card flat flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-[var(--text)]">
                {client.label}
              </span>
              <Badge variant={client.production ? "success" : "default"}>
                {client.production ? "Production app" : "Development"}
              </Badge>
            </div>

            {!client.enabled && client.production ? (
              <p className="help">
                A production client is turned on by registering it under Apps
                Outside the Platform on the moderation page of the console. The
                secret is shown there once, and rotated here if it is lost.
              </p>
            ) : !client.enabled ? (
              <form action={dispatch} className="flex flex-col gap-3">
                <input type="hidden" name="intent" value="enable" />
                <input type="hidden" name="clientId" value={client.clientId} />
                <label className="field">
                  <span className="label">Endpoint URL (optional for now)</span>
                  <Input
                    mono
                    name="endpointUrl"
                    type="url"
                    placeholder="https://your-project.supabase.co/functions/v1/platform-moderation"
                  />
                </label>
                <FormButton theme="cyan" type="submit" disabled={isPending}>
                  Turn on moderation
                </FormButton>
              </form>
            ) : (
              <>
                {state.secret && mine && (
                  <div className="flex flex-col gap-1.5">
                    <span className="label">Signing secret</span>
                    <Input
                      mono
                      copy
                      className="max-w-sm"
                      value={state.secret}
                    />
                    <p className="help">
                      Shown once. It signs your reports to DevDogs and verifies
                      the decisions DevDogs sends back.
                    </p>
                  </div>
                )}

                <form action={dispatch} className="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="set-endpoint" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
                  <label className="field">
                    <span className="label">Endpoint URL</span>
                    <Input
                      mono
                      name="endpointUrl"
                      type="url"
                      defaultValue={client.endpointUrl ?? ""}
                      placeholder="https://your-project.supabase.co/functions/v1/platform-moderation"
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <FormButton
                      theme="black"
                      type="submit"
                      disabled={isPending}
                    >
                      Save endpoint
                    </FormButton>
                  </div>
                </form>

                <form action={dispatch}>
                  <input type="hidden" name="intent" value="rotate-secret" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
                  <FormButton
                    theme="rose"
                    type="submit"
                    disabled={isPending}
                    className="text-sm"
                  >
                    Rotate signing secret
                  </FormButton>
                </form>

                {!client.production && (
                  <form action={dispatch} className="flex flex-col gap-2">
                    <input type="hidden" name="intent" value="send-test" />
                    <input
                      type="hidden"
                      name="clientId"
                      value={client.clientId}
                    />
                    <span className="label">Send test action</span>
                    <p className="help">
                      Sends a real signed delivery to your endpoint. The
                      moderators never see it.
                    </p>
                    <Select
                      name="type"
                      defaultValue="content.hide"
                      aria-label="Test action"
                    >
                      {ACTIONS.map(([value, label]) => (
                        <Select.Item key={value} value={value}>
                          {label}
                        </Select.Item>
                      ))}
                    </Select>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        name="contentType"
                        placeholder="content type (session)"
                        className="w-44"
                      />
                      <Input
                        name="contentRef"
                        placeholder="content id"
                        className="w-44"
                      />
                    </div>
                    <FormButton
                      theme="cyan"
                      type="submit"
                      disabled={isPending || !client.endpointUrl}
                    >
                      Send test action
                    </FormButton>
                  </form>
                )}

                {client.testDeliveries.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="label">Recent test actions</span>
                    <ul className="flex flex-col gap-1 text-xs text-[var(--text-2)]">
                      {client.testDeliveries.map((d) => (
                        <li key={d.id} className="flex flex-wrap gap-2">
                          <span className="font-mono">{d.type}</span>
                          <Badge
                            variant={
                              d.status === "delivered"
                                ? "success"
                                : d.status === "failed"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {d.status}
                          </Badge>
                          {d.lastError && d.status !== "delivered" && (
                            <span className="text-[var(--text-3)]">
                              {d.lastError}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="label">Sandbox reports</span>
                  {client.sandboxReports.length === 0 ? (
                    <p className="help">
                      None yet. Reports your backend files with this client
                      appear here, and only here.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-xs text-[var(--text-2)]">
                      {client.sandboxReports.map((r) => (
                        <li key={r.id} className="flex flex-wrap gap-2">
                          <span className="font-mono">
                            {r.contentType}: {r.contentRef}
                          </span>
                          <Badge>{r.reason.replace(/_/g, " ")}</Badge>
                          <span className="text-[var(--text-3)]">
                            {new Date(r.createdAt).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {showMessage && (
              <Callout
                tone={state.ok ? "success" : "critical"}
                alert={!state.ok}
              >
                {state.message}
              </Callout>
            )}
          </div>
        );
      })}
    </div>
  );
}
