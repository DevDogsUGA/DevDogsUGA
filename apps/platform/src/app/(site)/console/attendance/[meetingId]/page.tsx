import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import { PresentationIcon, UploadSimpleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import OpenDisplayLink from "~/components/AttendanceDisplay/OpenDisplayLink";
import ConsoleShell from "~/components/Console/ConsoleShell";
import {
  AddAttendeeForm,
  InviteActions,
  RemoveAttendee,
} from "~/components/Console/MeetingAttendance";
import "~/components/Console/meeting-detail.css";
import { formatAttendanceCount } from "~/lib/attendanceCount";
import { isMeetingEditable } from "~/lib/attendanceInvite";
import { formatEventDateTime, formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";

import { getOfficerAttendanceMeeting } from "~/server/attendance/getOfficerMeeting";
import {
  getMeetingDetail,
  type DetailAttendee,
} from "~/server/attendance/meetingDetail";

import { PageHeading } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import { Card } from "~/ui/card";
import LinkButton from "~/ui/link-button";
import { Table, TBody, Td, Th, THead, Tr } from "~/ui/table";

export const metadata: Metadata = {
  title: "Meeting | Console | DevDogs",
  robots: { index: false },
};

const METHOD_LABEL: Record<DetailAttendee["method"], string> = {
  qr: "QR scan",
  manual_code: "Typed code",
  import: "Imported",
  officer: "Added by an officer",
};

function Method({ attendee }: { attendee: DetailAttendee }) {
  if (attendee.method !== "officer")
    return <>{METHOD_LABEL[attendee.method]}</>;
  return (
    <>
      Added by <b>{attendee.addedBy?.name ?? "Deleted member"}</b>
    </>
  );
}

function Survey({ attendee }: { attendee: DetailAttendee }) {
  const { answered, asked, answers } = attendee.survey;
  if (asked === 0) return <span className="muted">No survey</span>;
  const done = answered === asked;
  return (
    <details className="md-survey">
      <summary>
        <Badge variant={done ? "success" : "default"}>
          {done
            ? "Done"
            : answered === 0
              ? "Not done"
              : `${answered} of ${asked}`}
        </Badge>
        <span className="sr-only">
          {" "}
          {attendee.name ?? "attendee"} survey answers
        </span>
      </summary>
      {answers.length === 0 ? (
        <p className="small muted">No answers yet.</p>
      ) : (
        <ul className="md-answers">
          {answers.map((a) => (
            <li key={a.prompt}>
              <b>{a.prompt}</b>
              {a.answer}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  await requireAccess(rules.manageAttendance);
  const { meetingId } = await params;
  const meeting = await getOfficerAttendanceMeeting(meetingId);
  if (!meeting) notFound();
  const now = new Date();
  const detail = await getMeetingDetail(meeting.id, meeting.startsAt, now);
  const title = meetingTitle(meeting);
  const canceled = meeting.cancelledAt !== null;
  const editable = isMeetingEditable(meeting, now);

  return (
    <ConsoleShell current="/console/attendance">
      <PageHeading
        crumbs={[
          { label: "Meetings", href: "/console/attendance" },
          { label: title },
        ]}
        title={title}
        description={`${formatEventSpan(meeting.startsAt, meeting.endsAt)} · ${formatAttendanceCount(detail.counts)}`}
        actions={
          <>
            {editable && (
              <LinkButton
                href={`/console/data/imports?kind=attendance&meeting=${meeting.id}`}
                variant="outline"
              >
                <UploadSimpleIcon weight="bold" aria-hidden />
                Import a sign-in sheet
              </LinkButton>
            )}
            {!canceled && (
              <OpenDisplayLink
                href={`/console/attendance/${meeting.id}`}
                className="btn secondary"
              >
                <PresentationIcon weight="bold" aria-hidden />
                Open projector display
                <span className="sr-only">
                  {" "}
                  (opens the projector in a new window)
                </span>
              </OpenDisplayLink>
            )}
            <Link
              className="btn secondary"
              href={`/console/attendance/${meeting.id}/graphics`}
            >
              Graphics
            </Link>
          </>
        }
      />

      {canceled && (
        <Callout tone="warning" title="Canceled in the schedule.">
          Nobody can check in and attendance cannot be edited.
        </Callout>
      )}

      <div className="con-sect" id="add">
        <h2>Add someone</h2>
      </div>
      {editable ? (
        <Card flat>
          <AddAttendeeForm meetingId={meeting.id} />
        </Card>
      ) : (
        !canceled && (
          <Callout tone="info">
            Attendance can be edited once the meeting has started.
          </Callout>
        )
      )}

      <div className="con-sect" id="attendees">
        <h2>Attendees</h2>
        <span className="small muted">
          {formatAttendanceCount(detail.counts)}
        </span>
      </div>
      {detail.attendees.length === 0 ? (
        <Callout tone="info">Nobody is recorded for this meeting yet.</Callout>
      ) : (
        <Table caption={`Attendees at ${title}`}>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>How</Th>
              <Th>Checked in</Th>
              <Th>Survey</Th>
              {editable && (
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              )}
            </Tr>
          </THead>
          <TBody>
            {detail.attendees.map((a) => {
              const who = a.name ?? "Deleted member";
              return (
                <Tr key={a.id}>
                  <Td strong>
                    {who}
                    {a.isOfficer && (
                      <>
                        {" "}
                        <Badge variant="brand">Officer</Badge>
                      </>
                    )}
                  </Td>
                  <Td wrap>
                    <Method attendee={a} />
                  </Td>
                  <Td>{formatEventDateTime(a.recordedAt)}</Td>
                  <Td wrap>
                    <Survey attendee={a} />
                  </Td>
                  {editable && (
                    <Td wrap>
                      <RemoveAttendee
                        meetingId={meeting.id}
                        attendanceId={a.id}
                        who={who}
                      />
                    </Td>
                  )}
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}

      {detail.invites.length > 0 && (
        <>
          <div className="con-sect" id="invites">
            <h2>Pending invites</h2>
            <span className="small muted">
              Each link works once, for that address only
            </span>
          </div>
          <Table caption="Pending attendance invites">
            <THead>
              <Tr>
                <Th>Address</Th>
                <Th>Invited by</Th>
                <Th>Expires</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {detail.invites.map((invite) => (
                <Tr key={invite.id}>
                  <Td strong>{invite.ugaEmail}</Td>
                  <Td>{invite.createdByName ?? "Deleted member"}</Td>
                  <Td>
                    {invite.state === "expired" ? (
                      <Badge variant="warning">Expired</Badge>
                    ) : (
                      formatEventDateTime(invite.expiresAt)
                    )}
                  </Td>
                  <Td wrap>
                    <InviteActions
                      meetingId={meeting.id}
                      inviteId={invite.id}
                      who={invite.ugaEmail}
                    />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </>
      )}

      {detail.tallies.length > 0 && (
        <>
          <div className="con-sect" id="survey">
            <h2>Survey answers</h2>
            <span className="small muted">This meeting&rsquo;s questions</span>
          </div>
          <div className="md-grid">
            {detail.tallies.map((tally) => (
              <Card key={tally.questionId} flat>
                <h3>{tally.prompt}</h3>
                <p className="small muted">
                  {tally.responses} of {detail.counts.total} answered
                </p>
                {tally.buckets && (
                  <ul className="md-tally">
                    {tally.buckets.map((bucket) => (
                      <li key={bucket.label}>
                        <span>{bucket.label}</span>
                        <b>{bucket.count}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="con-sect" id="sync">
        <h2>Fix by hand in Bevy and Engage</h2>
        <span className="small muted">
          {detail.lastExportAt
            ? `Changes since the export on ${formatEventDateTime(detail.lastExportAt)}`
            : "Nothing exported yet"}
        </span>
      </div>
      {detail.lastExportAt === null ? (
        <Callout tone="info">
          This meeting has not been exported, so there is nothing to fix. The
          first export includes everything above.
        </Callout>
      ) : detail.todos.length === 0 ? (
        <Callout tone="success">
          Nothing changed since the last export; Bevy and Engage match.
        </Callout>
      ) : (
        <ul className="md-todos">
          {detail.todos.map((todo) => (
            <li key={todo.userId}>
              <Callout tone="warning">
                {todo.kind === "add" ? "Add" : "Remove"}{" "}
                <b>{todo.name ?? "Deleted member"}</b>
                {todo.email ? ` (${todo.email})` : ""} in Bevy and Engage
                {todo.kind === "remove" ? " (set to NA in Engage)" : ""}.
              </Callout>
            </li>
          ))}
        </ul>
      )}
    </ConsoleShell>
  );
}
