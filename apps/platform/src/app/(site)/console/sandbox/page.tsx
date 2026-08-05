import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ConsolePageShell from "~/components/ConsolePageShell";
import EmptyState from "~/components/participation/EmptyState";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { expectSession } from "~/server/auth";
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

  const userId = await expectSession().catch(() => redirect("/auth"));
  const { connected, error } = await searchParams;

  const configured = isConfigured();
  const connection_ = await getConnection(userId);
  const environments = await getEnvironmentsForMember(userId);
  const awaiting = await getTeamsAwaitingEnvironment(userId);

  return (
    <ConsolePageShell
      accent="blue"
      title="Sandbox environments"
      description="One Supabase instance your whole team builds against, with each of you signed in as yourself."
    >
      {error && <Problem code={error} />}
      {connected && (
        <p className="rounded-sm border-2 border-black bg-emerald-50 p-4 text-sm font-semibold">
          Supabase account connected.
        </p>
      )}

      {!configured ? (
        <section className="rounded-sm border-2 border-black bg-white p-6 text-sm">
          <h2 className="font-semibold">Not configured yet</h2>
          <p className="mt-2 opacity-80">
            Sandbox environments need a registered Supabase OAuth application.
            Until <code>SUPABASE_OAUTH_CLIENT_ID</code> and{" "}
            <code>SUPABASE_OAUTH_CLIENT_SECRET</code> are set, nothing on this
            page can provision anything — which is why it says so rather than
            offering a button that would fail.
          </p>
        </section>
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
              className="flex flex-col gap-2 rounded-sm border-2 border-black bg-white p-4"
            >
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold">{env.name}</span>
                <StatusChip status={env.status} />
              </span>
              <code className="text-xs opacity-70">{env.proxyHostname}</code>
              <span className="text-xs opacity-70">
                {env.teamNames.join(", ")} · {env.memberCount}{" "}
                {env.memberCount === 1 ? "member" : "members"} with access
                {env.isOwner && " · you own this project"}
              </span>
              {env.lastSeenActiveAt && (
                <span className="text-xs opacity-70">
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
        <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
          <h2 className="font-semibold">Teams without an environment</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {awaiting.map((team) => (
              <li key={team.id} className="opacity-80">
                {team.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
        <h2 className="font-semibold">Getting connected from your machine</h2>
        <pre className="mt-2 overflow-x-auto rounded-sm bg-black p-3 text-xs text-white">
          pnpm sb link --team &lt;your-team-slug&gt;
        </pre>
        <p className="mt-2 opacity-80">
          That writes both keys into <code>.env.local</code> under the names a
          real Supabase project uses. Use the publishable one in anything that
          runs in a browser; the secret one bypasses row-level security, and the
          proxy refuses it from a browser exactly as Supabase does.
        </p>
      </section>
    </ConsolePageShell>
  );
}

function ConnectionCard({
  state,
}: {
  state: { connected: boolean; orgSlug: string | null; expiresAt: Date | null };
}) {
  if (!state.connected) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-sm border-2 border-black bg-white p-4">
        <span className="flex flex-col text-sm">
          <span className="font-semibold">Connect your Supabase account</span>
          <span className="opacity-70">
            The project is created under your own free account — two projects,
            no card. You keep it after the event.
          </span>
        </span>
        <Link
          href="/api/supabase/authorize"
          className="rounded-sm border-2 border-black bg-black px-3 py-1.5 text-sm font-semibold text-white"
        >
          Connect Supabase
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
      <span className="font-semibold">Supabase account connected</span>
      {state.orgSlug && (
        <span className="ml-2 opacity-70">({state.orgSlug})</span>
      )}
      {state.expiresAt && (
        <p className="mt-1 text-xs opacity-70">
          Access refreshes automatically; the current grant runs to{" "}
          {formatEventDateTime(state.expiresAt)}.
        </p>
      )}
    </section>
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
  return (
    <span className="rounded-sm border-2 border-black px-2 py-0.5 text-xs font-semibold">
      {COPY[status] ?? status}
    </span>
  );
}

function Problem({ code }: { code: string }) {
  const COPY: Record<string, string> = {
    scopes:
      "Connected, but the grant is missing a permission this needs. Disconnect and reconnect, approving every scope.",
    exchange_failed:
      "Supabase did not complete the connection. Nothing was saved; try again.",
    access_denied: "You declined the connection, so nothing was changed.",
  };
  return (
    <p role="alert" className="text-sm font-semibold text-red-700">
      {COPY[code] ?? "Something went wrong connecting your Supabase account."}
    </p>
  );
}
