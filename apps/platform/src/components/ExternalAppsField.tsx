"use client";

import { registerExternalApp } from "~/server/actions/moderationDeliveries";
import FormButton from "~/components/FormButton";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import { EmptyState } from "~/ui/empty-state";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import { CommandFeedback, useCommand } from "~/ui/use-command";

export interface ExternalAppEntry {
  id: string;
  slug: string;
  displayName: string;
  clientId: string | null;
  endpointUrl: string | null;
  contentTypes: string[];
}

/**
 * The apps whose Report & Block runs outside this database, and the form that
 * registers one. Registering turns an OAuth client into a production app: its
 * reports reach moderators and decisions are delivered to its endpoint.
 */
export default function ExternalAppsField({
  apps,
  canRegister,
}: {
  apps: ExternalAppEntry[];
  canRegister: boolean;
}) {
  const { run, pending: isPending, result } = useCommand(registerExternalApp);

  return (
    <div className="con-stack">
      {apps.length === 0 ? (
        <EmptyState
          title="No outside apps"
          description="Reports from apps on this platform need no registration."
        />
      ) : (
        <ul className="con-apps">
          {apps.map((app) => (
            <li key={app.id}>
              <div className="con-meta">
                <b style={{ color: "var(--text)" }}>{app.displayName}</b>
                <code className="con-code">{app.slug}</code>
                {!app.clientId && <Badge variant="danger">no client</Badge>}
              </div>
              <code className="con-code block">
                {app.endpointUrl ?? "no endpoint"}
              </code>
              <p className="small muted" style={{ margin: 0 }}>
                Content types: {app.contentTypes.join(", ") || "none"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!canRegister && (
        <Callout
          tone="info"
          title="You can see these apps but not register them."
        >
          Registering needs Manage OAuth apps. The form is hidden.
        </Callout>
      )}

      {canRegister && (
        <form action={run} className="con-stack">
          <h3 className="h3" style={{ margin: 0 }}>
            Register an app
          </h3>
          <p className="help" style={{ margin: 0 }}>
            Only a production OAuth client can be registered. Re-registering a
            slug updates it, and pointing it at another client moves the
            registration (the old client&apos;s reports are then refused until
            it is registered again).
          </p>
          <div className="con-fields">
            <Field label="Slug" htmlFor="app-slug">
              <Input id="app-slug" name="slug" required placeholder="dogpack" />
            </Field>
            <Field label="Name" htmlFor="app-name">
              <Input
                id="app-name"
                name="displayName"
                required
                placeholder="DogPack"
              />
            </Field>
            <Field label="OAuth client id" htmlFor="app-client">
              <Input
                id="app-client"
                name="clientId"
                required
                placeholder="client id"
                className="mono"
              />
            </Field>
            <Field label="Endpoint" htmlFor="app-endpoint">
              <Input
                id="app-endpoint"
                name="endpointUrl"
                required
                type="url"
                placeholder="https://<ref>.supabase.co/functions/v1/platform-moderation"
              />
            </Field>
          </div>
          <Field
            label="Content types"
            htmlFor="app-types"
            description="One per line: slug | label | link template (optional)."
          >
            <Textarea
              id="app-types"
              name="contentTypes"
              required
              rows={3}
              className="mono"
              placeholder={
                "session | Study session | https://app.example/s/{ref}\nprofile | Profile"
              }
            />
          </Field>
          <FormButton
            theme="cyan"
            type="submit"
            disabled={isPending}
            className="w-fit"
          >
            Register app
          </FormButton>
          <CommandFeedback result={result} />
          {result?.ok && result.data?.secret && (
            <code className="con-code block">{result.data.secret}</code>
          )}
        </form>
      )}
    </div>
  );
}
