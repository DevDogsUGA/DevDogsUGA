import type { Metadata } from "next";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { formatEventDateTime } from "~/lib/eventTime";
import type { ReflectionRevisionDetail } from "~/server/loaders/auditLog";
import { getAuditEventDetailData } from "~/server/loaders/auditLog";
import { PageHeading, Panel } from "~/ui/app-shell";
import { DefinitionList } from "~/ui/definition-list";
import { TerminalBlock } from "~/ui/terminal-block";

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
    <Panel title={label}>
      <DefinitionList
        items={[
          {
            term: "Activity",
            detail: <code>{`meeting:${revision.meetingId}`}</code>,
          },
          {
            term: "Submitted",
            detail: revision.submittedAt
              ? formatEventDateTime(revision.submittedAt)
              : "Draft",
          },
          ...(revision.changeReason
            ? [{ term: "Reason", detail: revision.changeReason }]
            : []),
        ]}
      />
      <p className="con-revision">{revision.content}</p>
    </Panel>
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
    <ConsoleShell current="/console/audit-log">
      <PageHeading
        crumbs={[
          { label: "Audit log", href: "/console/audit-log" },
          { label: "Event" },
        ]}
        title="Audit event"
        description={`${event.action} · ${formatEventDateTime(event.createdAt)}`}
      />

      <Panel
        title={`${event.targetType}: ${event.targetName ?? event.targetId}`}
      >
        <DefinitionList
          items={[
            { term: "Source", detail: event.source },
            {
              term: "Actor",
              detail:
                event.actorName === event.actor
                  ? `${event.actorType} · ${event.actor}`
                  : `${event.actorType} · ${event.actorName} (${event.actor})`,
            },
            { term: "Event ID", detail: <code>{event.id}</code> },
            {
              term: "Correlation ID",
              detail: event.correlationId ? (
                <code>{event.correlationId}</code>
              ) : (
                "None"
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Metadata">
        <TerminalBlock title="metadata.json">
          {JSON.stringify(event.metadata, null, 2)}
        </TerminalBlock>
      </Panel>

      <Revision label="Before reflection revision" revision={beforeRevision} />
      <Revision label="After reflection revision" revision={afterRevision} />
    </ConsoleShell>
  );
}
