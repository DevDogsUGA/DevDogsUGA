import type { Metadata } from "next";
import Link from "next/link";
import ConsoleFrame from "~/classic/components/Console/ConsoleFrame";
import PageShell from "~/classic/components/PageShell";
import { formatEventDateTime } from "~/lib/eventTime";
import type { ReflectionRevisionDetail } from "~/server/loaders/auditLog";
import { getAuditEventDetailData } from "~/server/loaders/auditLog";
import { ConsoleCard } from "~/classic/ui/card";

export const metadata: Metadata = {
  title: "Audit event | Console | DevDogs",
  robots: { index: false },
};

function Revision({
  label,
  revision,
}: {
  label: string;
  revision: ReflectionRevisionDetail | null;
}) {
  if (!revision) return null;

  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-4">
      <h3 className="font-semibold text-white">{label}</h3>
      <dl className="mt-2 grid gap-1 text-xs text-mauve-300">
        <div>
          <dt className="inline font-medium text-white/80">Activity: </dt>
          <dd className="inline font-mono">
            {`meeting:${revision.meetingId}`}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-white/80">Submitted: </dt>
          <dd className="inline">
            {revision.submittedAt
              ? formatEventDateTime(revision.submittedAt)
              : "Draft"}
          </dd>
        </div>
        {revision.changeReason && (
          <div>
            <dt className="inline font-medium text-white/80">Reason: </dt>
            <dd className="inline">{revision.changeReason}</dd>
          </div>
        )}
      </dl>
      <p className="mt-4 rounded-md bg-black/20 p-3 text-sm whitespace-pre-wrap text-mauve-100">
        {revision.content}
      </p>
    </section>
  );
}

export default async function AuditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event, beforeRevision, afterRevision } =
    await getAuditEventDetailData(eventId);

  return (
    <ConsoleFrame>
      <PageShell
        accent="blue"
        title="Audit event"
        description={`${event.action} · ${formatEventDateTime(event.createdAt)}`}
      >
        <ConsoleCard.Root>
          <ConsoleCard.Header
            title={`${event.targetType}: ${event.targetName ?? event.targetId}`}
            description={`${event.source} · ${event.actorType} · ${
              event.actorName === event.actor
                ? event.actor
                : `${event.actorName} (${event.actor})`
            }`}
          />
          <ConsoleCard.Content>
            <div className="grid gap-4">
              <dl className="grid gap-2 text-sm text-mauve-200 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-mauve-400">Event ID</dt>
                  <dd className="font-mono break-all">{event.id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mauve-400">Correlation ID</dt>
                  <dd className="font-mono break-all">
                    {event.correlationId ?? "None"}
                  </dd>
                </div>
              </dl>

              <section>
                <h3 className="mb-2 font-semibold text-white">Metadata</h3>
                <pre className="overflow-x-auto rounded-md bg-black/20 p-3 text-xs text-mauve-200">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </section>

              <Revision
                label="Before reflection revision"
                revision={beforeRevision}
              />
              <Revision
                label="After reflection revision"
                revision={afterRevision}
              />

              <Link
                className="text-sm text-blue-300 hover:underline"
                href="/dashboard/audit-log"
              >
                Back to audit log
              </Link>
            </div>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      </PageShell>
    </ConsoleFrame>
  );
}
