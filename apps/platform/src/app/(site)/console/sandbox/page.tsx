import Link from "next/link";
import { connection } from "next/server";
import type { ComponentProps } from "react";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";
import PageShell from "~/components/PageShell";
import EmptyState from "~/components/participation/EmptyState";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { requireSession } from "~/server/auth/require";
import {
  getConnection,
  getEnvironmentsForMember,
  getTeamsAwaitingEnvironment,
} from "~/server/loaders/sandbox";
import { isConfigured } from "~/server/supabase/oauth";

/**
 * /console/sandbox
 *
 * A team's shared Supabase instance, and the account that owns it.
 *
 * The page shows what a member can reach rather than what they own, because
 * those differ by design: one environment is owned by the team lead and serves
 * everybody attached to it, and possibly more than one team.
 */
export default async function SandboxConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  // Statuses are wall-clock facts about somebody else's infrastructure, and
  // "paused" versus "active" is the whole question this page answers.
  await connection();

  const userId = await requireSession();
  const { connected, error } = await searchParams;

  const configured = isConfigured();
  // Three independent reads of the same session's access: awaited together so
  // the page waits once rather than three times in a row.
  const [connection_, environments, awaiting] = await Promise.all([
    getConnection(userId),
    getEnvironmentsForMember(userId),
    getTeamsAwaitingEnvironment(userId),
  ]);

  return (
    <PageShell
      accent="blue"
      title="Sandbox environments"
      description="One Supabase instance your whole team builds against, with each of you signed in as yourself."
    >
      {error && <Problem code={error} />}
      {connected && (
        <Callout tone="success">Supabase account connected.</Callout>
      )}

      {!configured ? (
        <Callout tone="warning" title="Not configured yet">
          Sandbox environments need a registered Supabase OAuth application.
          Until{" "}
          <code className="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-xs text-mauve-200">
            SUPABASE_OAUTH_CLIENT_ID
          </code>{" "}
          and{" "}
          <code className="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-xs text-mauve-200">
            SUPABASE_OAUTH_CLIENT_SECRET
          </code>{" "}
          are set, nothing on this page can provision anything — which is why it
          says so rather than offering a button that would fail.
        </Callout>
      ) : (
        <ConnectionCard state={connection_} />
      )}

      {environments.length === 0 ? (
        <EmptyState
          title="No environment yet"
          body="Your team's lead connects a Supabase account and provisions one free project. Everybody else gets access automatically — there is no key to copy and nothing to share."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {environments.map((env) => (
            <li
              key={env.id}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
            >
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold text-white">{env.name}</span>
                <StatusChip status={env.status} />
              </span>
              <code className="self-start rounded-sm bg-white/10 px-1 py-0.5 font-mono text-xs text-mauve-200">
                {env.proxyHostname}
              </code>
              <span className="text-xs text-mauve-400">
                {env.teamNames.join(", ")} · {env.memberCount}{" "}
                {env.memberCount === 1 ? "member" : "members"} with access
                {env.isOwner && " · you own this project"}
              </span>
              {env.lastSeenActiveAt && (
                <span className="text-xs text-mauve-400">
                  Last active{" "}
                  <time dateTime={env.lastSeenActiveAt.toISOString()}>
                    {formatEventDateTime(env.lastSeenActiveAt)} (
                    {formatRelative(env.lastSeenActiveAt)})
                  </time>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {awaiting.length > 0 && configured && connection_.connected && (
        <ConsoleCard.Root id="teams-without-an-environment">
          <ConsoleCard.Header title="Teams without an environment" />
          <ConsoleCard.Content>
            <ul className="flex flex-col gap-1 text-sm">
              {awaiting.map((team) => (
                <li key={team.id} className="text-mauve-300">
                  {team.name}
                </li>
              ))}
            </ul>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      <ConsoleCard.Root id="getting-connected">
        <ConsoleCard.Header title="Getting connected from your machine" />
        <ConsoleCard.Content>
          <div className="flex flex-col gap-3">
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-mauve-200">
              pnpm devtools link --team &lt;your-team-slug&gt;
            </pre>
            <p className="text-sm text-mauve-300">
              That writes both keys into{" "}
              <code className="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-xs text-mauve-200">
                .env.local
              </code>{" "}
              under the names a real Supabase project uses. Use the publishable
              one in anything that runs in a browser; the secret one bypasses
              row-level security, and the proxy refuses it from a browser
              exactly as Supabase does.
            </p>
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </PageShell>
  );
}

function ConnectionCard({
  state,
}: {
  state: { connected: boolean; orgSlug: string | null; expiresAt: Date | null };
}) {
  if (!state.connected) {
    return (
      <ConsoleCard.Root id="connect-supabase">
        <ConsoleCard.Header
          title="Connect your Supabase account"
          description="The project is created under your own free account — two projects, no card. You keep it after the event."
        >
          <Link
            href="/supabase/authorize"
            className="rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
          >
            Connect Supabase
          </Link>
        </ConsoleCard.Header>
      </ConsoleCard.Root>
    );
  }

  return (
    <ConsoleCard.Root id="supabase-connection">
      <ConsoleCard.Header
        title="Supabase account connected"
        description={
          state.expiresAt ? (
            <>
              Access refreshes automatically; the current grant runs to{" "}
              {formatEventDateTime(state.expiresAt)}.
            </>
          ) : undefined
        }
      >
        {state.orgSlug && (
          <span className="text-sm text-mauve-400">({state.orgSlug})</span>
        )}
      </ConsoleCard.Header>
    </ConsoleCard.Root>
  );
}

/**
 * Status, said plainly.
 *
 * `paused` gets an explanation rather than a bare word, because a paused
 * project is the state most likely to read as "broken" when it is in fact
 * normal and reversible — and the wait is about four minutes, which is worth
 * saying before somebody starts debugging their connection string.
 */
function StatusChip({ status }: { status: string }) {
  const COPY: Record<string, string> = {
    provisioning: "Setting up",
    active: "Ready",
    paused: "Paused — wakes in about 4 minutes",
    restoring: "Waking up",
    detached: "Not in use",
    revoked: "Ended",
    orphaned: "Project no longer exists",
  };
  // The colour draws the same line the copy does: green is reachable now, blue
  // is on its way there, amber needs waking, red is over.
  const VARIANT: Record<string, ComponentProps<typeof Badge>["variant"]> = {
    provisioning: "info",
    active: "success",
    paused: "warning",
    restoring: "info",
    detached: "default",
    revoked: "danger",
    orphaned: "danger",
  };
  return (
    <Badge variant={VARIANT[status] ?? "default"}>
      {COPY[status] ?? status}
    </Badge>
  );
}

function Problem({ code }: { code: string }) {
  const COPY: Record<string, string> = {
    scopes:
      "Connected, but the grant is missing a permission this needs. Disconnect and reconnect, approving every scope.",
    exchange_failed:
      "Supabase rejected the authorization. Nothing was saved -- the server log names the reason.",
    persist_failed:
      "Supabase authorized the connection, but saving it here failed. The grant is not stored; the server log names the reason.",
    access_denied: "You declined the connection, so nothing was changed.",
  };
  return (
    <Callout tone="critical" alert>
      {COPY[code] ?? "Something went wrong connecting your Supabase account."}
    </Callout>
  );
}
