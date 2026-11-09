"use client";

import { registerExternalApp } from "~/server/actions/moderationDeliveries";
import FormButton from "~/classic/components/FormButton";
import Badge from "~/classic/ui/badge";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";

export interface ExternalAppEntry {
  id: string;
  slug: string;
  displayName: string;
  clientId: string | null;
  endpointUrl: string | null;
  contentTypes: string[];
}

const fieldClass =
  "w-full rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white";

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
    <div className="flex flex-col gap-4">
      {apps.length === 0 ? (
        <p className="text-sm text-mauve-400">No external apps registered.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {apps.map((app) => (
            <li
              key={app.id}
              className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">
                  {app.displayName}
                </span>
                <span className="font-mono text-xs text-mauve-400">
                  {app.slug}
                </span>
                {!app.clientId && <Badge variant="danger">no client</Badge>}
              </div>
              <p className="truncate font-mono text-xs text-mauve-300">
                {app.endpointUrl ?? "no endpoint"}
              </p>
              <p className="text-xs text-mauve-400">
                Content types: {app.contentTypes.join(", ") || "none"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canRegister && (
        <form action={run} className="flex flex-col gap-3">
          <span className="font-medium text-white">Register an app</span>
          <p className="text-xs text-mauve-400">
            Only a production OAuth client can be registered. Re-registering a
            slug updates it, and pointing it at another client moves the
            registration (the old client&apos;s reports are then refused until
            it is registered again).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="slug"
              required
              placeholder="slug (dogpack)"
              className={fieldClass}
            />
            <input
              name="displayName"
              required
              placeholder="name (DogPack)"
              className={fieldClass}
            />
            <input
              name="clientId"
              required
              placeholder="OAuth client id"
              className={`${fieldClass} font-mono`}
            />
            <input
              name="endpointUrl"
              required
              type="url"
              placeholder="https://<ref>.supabase.co/functions/v1/platform-moderation"
              className={fieldClass}
            />
          </div>
          <textarea
            name="contentTypes"
            required
            rows={3}
            placeholder={
              "session | Study session | https://app.example/s/{ref}\nprofile | Profile"
            }
            className={`${fieldClass} font-mono`}
          />
          <FormButton
            theme="cyan"
            type="submit"
            disabled={isPending}
            className="w-fit text-sm"
          >
            Register
          </FormButton>
          <CommandFeedback result={result} />
          {/* The once-only secret keeps its instruction beside it: a toast
              would vanish before the officer has copied it. */}
          {result?.ok && result.data?.secret && result.message && (
            <p role="status" className="text-sm text-emerald-300">
              {result.message}
            </p>
          )}
          {result?.ok && result.data?.secret && (
            <code className="rounded-sm bg-mauve-800 px-2 py-1.5 font-mono text-xs break-all text-white select-all">
              {result.data.secret}
            </code>
          )}
        </form>
      )}
    </div>
  );
}
