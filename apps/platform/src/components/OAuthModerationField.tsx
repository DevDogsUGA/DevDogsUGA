"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { failure } from "~/lib/actionResult";
import {
  enableModeration,
  rotateModerationSecret,
  saveModerationEndpoint,
  sendModerationTest,
} from "~/server/actions/oauthModeration";
import type { ClientModeration } from "~/server/loaders/oauthModeration";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import Select from "~/components/Select";
import Badge from "~/ui/badge";
import SettingsField from "~/ui/settings-field";
import { CommandFeedback, useCommand } from "~/ui/use-command";

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
 * The endpoint URL is a Draft field on the page's save bar, so the page needs a
 * `SettingsFormProvider` and a `SettingsSaveBar`. Turning moderation on,
 * rotating the secret and sending a test action stay Commands that act at once;
 * the one-time secret reveal is theirs.
 *
 * A development client's reports never reach the moderators; they land here.
 */
export default function OAuthModerationField({
  clients,
}: {
  clients: ClientModeration[];
}) {
  if (clients.length === 0) {
    return (
      <p className="help">
        Create an OAuth client above first. Moderation is set up per client.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {clients.map((client) => (
        <ModerationCard key={client.clientId} client={client} />
      ))}
    </div>
  );
}

/**
 * One client's moderation card. It owns its three Commands, so a refusal and
 * the one-time secret stay with the client they belong to.
 */
function ModerationCard({ client }: { client: ClientModeration }) {
  const router = useRouter();
  // Shown once: neither turning on nor rotating can show it a second time.
  const [secret, setSecret] = useState<string | null>(null);
  const enable = useCommand(async (formData: FormData) => {
    const result = await enableModeration(client.clientId, formData);
    if (result.ok) setSecret(result.data?.secret ?? null);
    return result;
  });
  const rotate = useCommand(async () => {
    const result = await rotateModerationSecret(client.clientId);
    if (result.ok) setSecret(result.data?.secret ?? null);
    return result;
  });
  const test = useCommand(async (formData: FormData) => {
    const result = await sendModerationTest(client.clientId, formData);
    // A delivery that failed was still recorded, so the list has changed.
    if (!result.ok) router.refresh();
    return result;
  });
  const isPending = enable.pending || rotate.pending || test.pending;

  return (
    <div className="card flat flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-[var(--text)]">{client.label}</span>
        <Badge variant={client.production ? "success" : "default"}>
          {client.production ? "Production app" : "Development"}
        </Badge>
      </div>

      {!client.enabled && client.production ? (
        <p className="help">
          An app In production is turned on by registering it under Apps Outside
          the Platform on the moderation page of the console. The secret is
          shown there once, and rotated here if it is lost.
        </p>
      ) : !client.enabled ? (
        <form action={enable.run} className="flex flex-col gap-3">
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
          {secret && (
            <div className="flex flex-col gap-1.5">
              <span className="label">Signing secret</span>
              <Input mono copy className="max-w-sm" value={secret} />
              <p className="help">
                Shown once. It signs your reports to DevDogs and verifies the
                decisions DevDogs sends back.
              </p>
            </div>
          )}

          <EndpointField client={client} />

          <form action={() => rotate.run()}>
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
            <form action={test.run} className="flex flex-col gap-2">
              <span className="label">Send test action</span>
              <p className="help">
                Sends a real signed delivery to your endpoint. The moderators
                never see it.
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
                None yet. Reports your backend files with this client appear
                here, and only here.
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

      <CommandFeedback result={enable.result} />
      <CommandFeedback result={rotate.result} />
      <CommandFeedback result={test.result} />
    </div>
  );
}

/**
 * Where a client's decisions are delivered, as a Draft field `moderationEndpoint:<clientId>`.
 * The server's `endpointUrl` error is remapped to this field's id so it lands
 * under the input.
 */
function EndpointField({ client }: { client: ClientModeration }) {
  const router = useRouter();
  const id = `moderationEndpoint:${client.clientId}`;
  const [saved, setSaved] = useState(client.endpointUrl ?? "");
  const [draft, setDraft] = useState(saved);

  return (
    <SettingsField
      id={id}
      label={`${client.label} endpoint`}
      draft={draft}
      isDirty={draft !== saved}
      error={null}
      reset={() => setDraft(saved)}
      save={async () => {
        const result = await saveModerationEndpoint(client.clientId, draft);
        if (result.ok) {
          const url = draft.trim();
          setSaved(url);
          setDraft(url);
          router.refresh();
          return result;
        }
        const message = result.fieldErrors?.endpointUrl;
        return message ? failure(result.message, { [id]: message }) : result;
      }}
    >
      <label className="field">
        <span className="label">Endpoint URL</span>
        <Input
          mono
          type="url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="https://your-project.supabase.co/functions/v1/platform-moderation"
        />
      </label>
    </SettingsField>
  );
}
