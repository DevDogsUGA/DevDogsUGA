import { rules, requireAccess, loadCaller } from "~/server/auth/access";
import type { Metadata } from "next";
import {
  ImageIcon,
  PresentationIcon,
  ProhibitIcon,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import OpenDisplayLink from "~/components/AttendanceDisplay/OpenDisplayLink";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { tileOf } from "~/components/Console/meetings";
import {
  CATEGORY_LABEL,
  meetingCategory,
  timeRange,
} from "~/components/EventsSection/meetingView";
import { formatEventShortDate } from "~/lib/eventTime";
import { formatAttendanceCount } from "~/lib/attendanceCount";
import { meetingTitle } from "~/lib/meetingTitle";

import { getAttendanceCounts } from "~/server/attendance/counts";
import { getOfficerAttendanceMeetings } from "~/server/attendance/getOfficerMeeting";

import { PageHeading } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { Card } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { DateTile } from "~/ui/date-tile";
import { EmptyState } from "~/ui/empty-state";
import { LiveDot } from "~/ui/live-dot";
import { ListRow } from "~/ui/list-row";
import Pagination from "~/ui/pagination";

export const metadata: Metadata = {
  title: "Meetings | Console | DevDogs",
  robots: { index: false },
};

const PATH = "/console/attendance";
const PAST_PAGE_SIZE = 12;

type Meeting = Awaited<ReturnType<typeof getOfficerAttendanceMeetings>>[number];

type Counts = Awaited<ReturnType<typeof getAttendanceCounts>>;

function Row({
  meeting,
  counts,
  past,
  canManage,
}: {
  meeting: Meeting;
  /** Absent for a meeting that has not started, or for an officer without the attendance tools. */
  counts?: Counts;
  past?: boolean;
  /** Attendance tools; an officer without them is sent to the graphics. */
  canManage: boolean;
}) {
  const kind = meetingCategory(meeting);
  const off = meeting.cancelledAt !== null;
  return (
    <ListRow
      variant="meeting"
      kind={kind}
      past={past}
      off={off}
      href={
        canManage
          ? `/console/attendance/${meeting.id}`
          : `/console/attendance/${meeting.id}/graphics`
      }
      date={<DateTile kind={kind} {...tileOf(meeting.startsAt)} />}
      title={meetingTitle(meeting)}
      chip={<Chip kind={kind}>{CATEGORY_LABEL[kind]}</Chip>}
      meta={
        off
          ? "Canceled in the schedule · no check-in"
          : counts
            ? `${timeRange(meeting.startsAt, meeting.endsAt)} · ${formatAttendanceCount(counts.get(meeting.id) ?? { total: 0, officers: 0 })}`
            : timeRange(meeting.startsAt, meeting.endsAt)
      }
      end={
        <>
          <Link
            href={`/console/attendance/${meeting.id}/graphics`}
            className="btn secondary sm"
          >
            <ImageIcon weight="bold" aria-hidden />
            Graphics
            <span className="sr-only"> for {meetingTitle(meeting)}</span>
          </Link>
          {off || !canManage ? null : (
            <OpenDisplayLink
              href={`/console/attendance/${meeting.id}`}
              className="btn secondary sm"
            >
              <PresentationIcon weight="bold" aria-hidden />
              Open display
              <span className="sr-only">
                {" "}
                for {meetingTitle(meeting)} (opens the projector in a new
                window)
              </span>
            </OpenDisplayLink>
          )}
        </>
      }
      badges={
        off ? (
          <Badge variant="danger">
            <ProhibitIcon weight="bold" aria-hidden />
            Canceled in the schedule
          </Badge>
        ) : null
      }
    />
  );
}

export default async function AttendanceDisplaysPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  // Any officer may open the list for the graphics; the attendance tools and
  // counts on it still need `canManageAttendance`.
  const userId = (await requireAccess(rules.useGraphics)).userId;
  const [meetings, params, canManage] = await Promise.all([
    getOfficerAttendanceMeetings(),
    searchParams,
    loadCaller().then(
      (caller) =>
        caller !== null &&
        caller.userId === userId &&
        rules.manageAttendance(caller),
    ),
  ]);
  const counts = canManage ? await getAttendanceCounts() : undefined;
  const now = new Date();

  const live = meetings.filter(
    (m) => m.cancelledAt === null && m.startsAt <= now && m.endsAt >= now,
  );
  const upcoming = meetings
    .filter((m) => m.startsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  // Everything that is neither live nor ahead, so a canceled meeting whose
  // slot is still running lands here rather than nowhere.
  const past = meetings.filter((m) => !live.includes(m) && !(m.startsAt > now));

  const rawPage =
    typeof params.page === "string" ? parseInt(params.page, 10) : 1;
  const totalPages = Math.max(1, Math.ceil(past.length / PAST_PAGE_SIZE));
  const page = Math.min(
    totalPages,
    Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage),
  );
  const pastShown = past.slice(
    (page - 1) * PAST_PAGE_SIZE,
    page * PAST_PAGE_SIZE,
  );

  return (
    <ConsoleShell current={PATH}>
      <PageHeading
        title="Meetings"
        description={
          canManage
            ? "Open a meeting to see who attended, add or remove people, and put the live QR and rotating code on the projector, or its graphics to download posters."
            : "Open a meeting's graphics to download posters and social images. They stay available for past and future meetings."
        }
      />

      {live.map((meeting) => {
        const kind = meetingCategory(meeting);
        const title = meetingTitle(meeting);
        return (
          <Card
            as="section"
            key={meeting.id}
            kind={kind}
            className="con-tonight"
            aria-labelledby={`live-${meeting.id}`}
          >
            <DateTile kind={kind} {...tileOf(meeting.startsAt)} />
            <div>
              <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <span className="eyebrow k" style={{ margin: 0 }}>
                  Under way
                </span>
                <LiveDot>Happening now</LiveDot>
              </div>
              <h2 id={`live-${meeting.id}`}>{title}</h2>
              <div className="small muted" style={{ marginTop: 8 }}>
                {timeRange(meeting.startsAt, meeting.endsAt)}
                {counts &&
                  ` · ${formatAttendanceCount(counts.get(meeting.id) ?? { total: 0, officers: 0 })}`}
              </div>
            </div>
            <div className="acts">
              {canManage ? (
                <>
                  <OpenDisplayLink
                    href={`/console/attendance/${meeting.id}`}
                    className="btn primary"
                  >
                    <PresentationIcon weight="bold" aria-hidden />
                    Open display
                    <span className="sr-only">
                      {" "}
                      (opens the projector in a new window)
                    </span>
                  </OpenDisplayLink>
                  <Link
                    className="btn secondary"
                    href={`/console/attendance/${meeting.id}`}
                  >
                    Meeting page
                  </Link>
                </>
              ) : null}
              <Link
                className={canManage ? "btn secondary" : "btn primary"}
                href={`/console/attendance/${meeting.id}/graphics`}
              >
                Graphics
              </Link>
            </div>
          </Card>
        );
      })}

      <div className="con-sect" id="upcoming">
        <h2>Upcoming</h2>
        {upcoming.length > 0 && (
          <span className="small muted">
            {formatEventShortDate(upcoming[0]!.startsAt)} –{" "}
            {formatEventShortDate(upcoming[upcoming.length - 1]!.startsAt)}
          </span>
        )}
      </div>
      {upcoming.length === 0 ? (
        <EmptyState
          title="Nothing upcoming"
          description="No future meetings are on the schedule."
        />
      ) : (
        <div>
          {upcoming.map((meeting) => (
            <Row key={meeting.id} meeting={meeting} canManage={canManage} />
          ))}
        </div>
      )}

      <div className="con-sect" id="past">
        <h2>Past meetings</h2>
        <span className="small muted">Newest first</span>
      </div>
      {past.length === 0 ? (
        <EmptyState
          title="No past meetings"
          description="Meetings that have ended appear here."
        />
      ) : (
        <>
          <div>
            {pastShown.map((meeting) => (
              <Row
                key={meeting.id}
                meeting={meeting}
                counts={counts}
                past
                canManage={canManage}
              />
            ))}
          </div>
          <div className="con-foot">
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={past.length}
              label="meetings"
              buildHref={(n) =>
                n === 1 ? `${PATH}#past` : `${PATH}?page=${n}#past`
              }
            />
          </div>
        </>
      )}
    </ConsoleShell>
  );
}
