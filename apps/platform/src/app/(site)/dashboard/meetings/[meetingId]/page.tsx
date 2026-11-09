import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import OpenDisplayLink from "~/classic/components/AttendanceDisplay/OpenDisplayLink";
import ConsoleFrame from "~/classic/components/Console/ConsoleFrame";
import {
  AddAttendeeForm,
  InviteActions,
  RemoveAttendee,
} from "~/classic/components/Console/MeetingAttendance";
import PageShell from "~/classic/components/PageShell";
import { formatAttendanceCount } from "~/lib/attendanceCount";
import { isMeetingEditable } from "~/lib/attendanceInvite";
import { formatEventDateTime, formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";

import { getOfficerAttendanceMeeting } from "~/server/attendance/getOfficerMeeting";
import {
  getMeetingDetail,
  type DetailAttendee,
} from "~/server/attendance/meetingDetail";

import Badge from "~/classic/ui/badge";
import Callout from "~/classic/ui/callout";
import { ConsoleCard } from "~/classic/ui/card";

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

const LINK_CLASS =
  "rounded-sm text-mauve-400 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950";
const TH = "px-3 py-2 text-left text-xs font-medium text-mauve-400";
const TD = "px-3 py-3 align-top text-mauve-200";

function Method({ attendee }: { attendee: DetailAttendee }) {
  if (attendee.method !== "officer")
    return <>{METHOD_LABEL[attendee.method]}</>;
  return (
    <>
      Added by{" "}
      <b className="text-white">{attendee.addedBy?.name ?? "Deleted member"}</b>
    </>
  );
}

function Survey({ attendee }: { attendee: DetailAttendee }) {
  const { answered, asked, answers } = attendee.survey;
  if (asked === 0) return <span className="text-mauve-400">No survey</span>;
  const done = answered === asked;
  return (
    <details>
      <summary className="w-fit cursor-pointer">
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
        <p className="mt-2 text-xs text-mauve-400">No answers yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2 text-xs text-mauve-300">
          {answers.map((a) => (
            <li key={a.prompt}>
              <b className="block text-white/80">{a.prompt}</b>
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
    <ConsoleFrame>
      <PageShell
        accent="cyan"
        title={title}
        description={`${formatEventSpan(meeting.startsAt, meeting.endsAt)} · ${formatAttendanceCount(detail.counts)}`}
        actions={
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/dashboard/meetings" className={LINK_CLASS}>
              &larr; Back to meetings
            </Link>
            {editable && (
              <Link
                href={`/dashboard/data/imports?kind=attendance&meeting=${meeting.id}`}
                className={LINK_CLASS}
              >
                Import a sign-in sheet
              </Link>
            )}
            {!canceled && (
              <OpenDisplayLink
                href={`/dashboard/meetings/${meeting.id}`}
                className="font-medium text-cyan-300 transition hover:text-white focus-visible:outline-none"
              >
                Open display →
                <span className="sr-only">
                  {" "}
                  (opens the projector in a new window)
                </span>
              </OpenDisplayLink>
            )}
          </div>
        }
      >
        {canceled && (
          <Callout tone="warning" title="Canceled in the schedule.">
            Nobody can check in and attendance cannot be edited.
          </Callout>
        )}

        <ConsoleCard.Root id="add">
          <ConsoleCard.Header title="Add someone" />
          <ConsoleCard.Content>
            {editable ? (
              <AddAttendeeForm meetingId={meeting.id} />
            ) : (
              <p className="text-sm text-mauve-400">
                {canceled
                  ? "Attendance cannot be edited for a canceled meeting."
                  : "Attendance can be edited once the meeting has started."}
              </p>
            )}
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        <ConsoleCard.Root id="attendees">
          <ConsoleCard.Header
            title="Attendees"
            description={formatAttendanceCount(detail.counts)}
          />
          <ConsoleCard.Content>
            {detail.attendees.length === 0 ? (
              <p className="text-sm text-mauve-400">
                Nobody is recorded for this meeting yet.
              </p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Attendees at {title}</caption>
                  <thead>
                    <tr className="border-b border-mauve-800">
                      <th scope="col" className={TH}>
                        Name
                      </th>
                      <th scope="col" className={TH}>
                        How
                      </th>
                      <th scope="col" className={TH}>
                        Checked in
                      </th>
                      <th scope="col" className={TH}>
                        Survey
                      </th>
                      {editable && (
                        <th scope="col" className={TH}>
                          <span className="sr-only">Actions</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mauve-800">
                    {detail.attendees.map((a) => {
                      const who = a.name ?? "Deleted member";
                      return (
                        <tr key={a.id}>
                          <th
                            scope="row"
                            className={`${TD} text-left font-semibold text-white`}
                          >
                            {who}
                            {a.isOfficer && (
                              <>
                                {" "}
                                <Badge variant="info">Officer</Badge>
                              </>
                            )}
                          </th>
                          <td className={TD}>
                            <Method attendee={a} />
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            {formatEventDateTime(a.recordedAt)}
                          </td>
                          <td className={TD}>
                            <Survey attendee={a} />
                          </td>
                          {editable && (
                            <td className={TD}>
                              <RemoveAttendee
                                meetingId={meeting.id}
                                attendanceId={a.id}
                                who={who}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        {detail.invites.length > 0 && (
          <ConsoleCard.Root id="invites">
            <ConsoleCard.Header
              title="Pending invites"
              description="Each link works once, for that address only."
            />
            <ConsoleCard.Content>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Pending attendance invites
                  </caption>
                  <thead>
                    <tr className="border-b border-mauve-800">
                      <th scope="col" className={TH}>
                        Address
                      </th>
                      <th scope="col" className={TH}>
                        Invited by
                      </th>
                      <th scope="col" className={TH}>
                        Expires
                      </th>
                      <th scope="col" className={TH}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mauve-800">
                    {detail.invites.map((invite) => (
                      <tr key={invite.id}>
                        <th
                          scope="row"
                          className={`${TD} text-left font-semibold text-white`}
                        >
                          {invite.ugaEmail}
                        </th>
                        <td className={TD}>
                          {invite.createdByName ?? "Deleted member"}
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>
                          {invite.state === "expired" ? (
                            <Badge variant="warning">Expired</Badge>
                          ) : (
                            formatEventDateTime(invite.expiresAt)
                          )}
                        </td>
                        <td className={TD}>
                          <InviteActions
                            meetingId={meeting.id}
                            inviteId={invite.id}
                            who={invite.ugaEmail}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ConsoleCard.Content>
          </ConsoleCard.Root>
        )}

        {detail.tallies.length > 0 && (
          <ConsoleCard.Root id="survey">
            <ConsoleCard.Header
              title="Survey answers"
              description="This meeting's questions."
            />
            <ConsoleCard.Content>
              <div className="grid gap-6 sm:grid-cols-2">
                {detail.tallies.map((tally) => (
                  <div key={tally.questionId}>
                    <h3 className="font-semibold text-white">{tally.prompt}</h3>
                    <p className="text-xs text-mauve-400">
                      {tally.responses} of {detail.counts.total} answered
                    </p>
                    {tally.buckets && (
                      <ul className="mt-2 flex flex-col gap-1 text-sm text-mauve-200">
                        {tally.buckets.map((bucket) => (
                          <li
                            key={bucket.label}
                            className="flex justify-between gap-4"
                          >
                            <span>{bucket.label}</span>
                            <b className="text-white">{bucket.count}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </ConsoleCard.Content>
          </ConsoleCard.Root>
        )}

        <ConsoleCard.Root id="sync">
          <ConsoleCard.Header
            title="Fix by hand in Bevy and Engage"
            description={
              detail.lastExportAt
                ? `Changes since the export on ${formatEventDateTime(detail.lastExportAt)}`
                : "Nothing exported yet"
            }
          />
          <ConsoleCard.Content>
            {detail.lastExportAt === null ? (
              <Callout tone="info">
                This meeting has not been exported, so there is nothing to fix.
                The first export includes everything above.
              </Callout>
            ) : detail.todos.length === 0 ? (
              <Callout tone="success">
                Nothing changed since the last export; Bevy and Engage match.
              </Callout>
            ) : (
              <ul className="flex flex-col gap-2">
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
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      </PageShell>
    </ConsoleFrame>
  );
}
