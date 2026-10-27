import type { Metadata } from "next";
import { connection } from "next/server";
import PageShell from "~/components/PageShell";
import "~/components/participation/passport.css";
import CheckInForm, {
  MeetingLine,
  type CheckInMeeting,
} from "~/components/participation/CheckInForm";
import StarGrid from "~/components/participation/StarGrid";
import { PassportSummary } from "~/components/participation/StarBadges";
import EmptyState from "~/components/participation/EmptyState";
import {
  CATEGORY_LABEL,
  meetingCategory,
} from "~/components/EventsSection/meetingView";
import CheckInSurvey from "~/components/CheckInSurvey";
import ReflectionCards from "~/components/ReflectionCards";
import { formatEventDateTime } from "~/lib/eventTime";
import { formatMeetingWhen } from "~/components/participation/when";
import { meetingTitle } from "~/lib/meetingTitle";
import { getAttendanceMeetings } from "~/server/attendance/getMeetings";
import { expectSession } from "~/server/auth";
import { getStarsForUser, totalStars } from "~/server/loaders/stars";
import { getStreakForUser } from "~/server/loaders/streak";
import { getReflectionActivities } from "~/server/reflections/load";
import { getSurvey } from "~/server/survey/load";
import Callout, { type CalloutTone } from "~/ui/callout";
import { Card } from "~/ui/card";
import { TextLink } from "~/ui/text-link";

export const metadata: Metadata = {
  title: "Attendance | DevDogs",
  robots: { index: false },
};

const STATUS_COPY: Record<
  string,
  { title: string; body: string; tone: CalloutTone; good?: boolean }
> = {
  recorded: {
    title: "Attendance recorded",
    body: "You’re checked in. Your attendance and progress have been updated.",
    tone: "success",
    good: true,
  },
  duplicate: {
    title: "Already checked in",
    body: "Your original attendance record is still on file.",
    tone: "success",
    good: true,
  },
  invalid_meeting: {
    title: "Meeting unavailable",
    body: "That meeting was canceled, removed, or could not be found.",
    tone: "critical",
  },
  invalid: {
    title: "Code expired or invalid",
    body: "Use the current code shown at the meeting and try again.",
    tone: "critical",
  },
  rate_limited: {
    title: "Too many attempts",
    body: "Wait about a minute, then try the current code again.",
    tone: "warning",
  },
  invite_invalid: {
    title: "Invite link not valid",
    body: "That link is not one we issued. Ask the officer to send a new one.",
    tone: "critical",
  },
  invite_used: {
    title: "Invite already used",
    body: "That link has already been claimed. If that was you, your attendance is on file.",
    tone: "warning",
  },
  invite_expired: {
    title: "Invite expired",
    body: "That link has expired. Ask an officer to resend it.",
    tone: "critical",
  },
  invite_address_mismatch: {
    title: "Wrong account for this invite",
    body: "The invite is for a different UGA address than the one you signed in with. Sign out, open the link again, and choose the address the email was sent to. Nothing was recorded.",
    tone: "critical",
  },
  uga_required: {
    title: "Use your UGA Google account",
    body: "Attendance was not recorded. Sign in again with an @uga.edu account, then scan or enter the current code.",
    tone: "critical",
  },
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const requestedMeeting =
    typeof params.meeting === "string" ? params.meeting : undefined;
  const recordedAtParam =
    typeof params.recordedAt === "string" ? params.recordedAt : undefined;
  const recordedAt = recordedAtParam ? new Date(recordedAtParam) : null;
  const receipt = status ? STATUS_COPY[status] : undefined;
  const [meetings, userId] = await Promise.all([
    getAttendanceMeetings(),
    expectSession().catch(() => null),
  ]);
  // The survey link rides the meeting the check-in actually recorded, not
  // whatever is selected in the form below -- `requestedMeeting` is that
  // meeting's id whenever `status` came back from a check-in at all.
  const checkedInMeeting = meetings.find((m) => m.id === requestedMeeting);
  // Every meeting records a check-in; one that doesn't count for credit
  // says so rather than promising progress it won't show.
  const receiptBody =
    receipt?.good && checkedInMeeting && !checkedInMeeting.hasWorkshop
      ? "You’re checked in. Only workshop nights count toward stars, streaks or EL credit."
      : receipt?.body;
  const surveyUrl =
    receipt?.good && checkedInMeeting ? checkedInMeeting.surveyUrl : null;
  // The survey follows a check-in that stood (recorded or duplicate), for
  // the meeting it was recorded against; `getSurvey` also checks the
  // attendance row itself, so a hand-edited URL shows nothing.
  const surveyMeetingId =
    receipt?.good && requestedMeeting ? requestedMeeting : null;
  const [stars, reflectionData, streak, survey] = userId
    ? await Promise.all([
        getStarsForUser(userId),
        getReflectionActivities(userId),
        getStreakForUser(userId),
        surveyMeetingId && isUuid(surveyMeetingId)
          ? getSurvey(userId, surveyMeetingId)
          : null,
      ])
    : [null, null, null, null];
  const selected = meetings.some((meeting) => meeting.id === requestedMeeting)
    ? requestedMeeting
    : meetings[0]?.id;

  const options: CheckInMeeting[] = meetings.map((meeting) => {
    const category = meetingCategory(meeting);
    return {
      id: meeting.id,
      title: meetingTitle(meeting),
      when: formatMeetingWhen(meeting.startsAt, meeting.endsAt),
      category,
      categoryLabel: CATEGORY_LABEL[category],
      ongoing: meeting.ongoing,
    };
  });
  const checkedInOption = options.find((o) => o.id === checkedInMeeting?.id);
  const problem =
    receipt && !receipt.good
      ? {
          tone: receipt.tone,
          title: receipt.title,
          body: receipt.body,
          code: status === "invalid",
        }
      : undefined;

  return (
    <PageShell
      kind="build"
      title="Attendance"
      description="Scan the QR code on the projector, then type the six-digit code shown there. It changes every 30 seconds. New members can sign in with their UGA Google account without losing their check-in."
    >
      <div className="att-col">
        {receipt?.good && (
          <Card
            flat
            className="att-card att-wide"
            data-testid="checkin-receipt"
          >
            {checkedInOption && <MeetingLine meeting={checkedInOption} />}
            <Callout tone={receipt.tone} title={receipt.title}>
              {receiptBody}
              {recordedAt && !Number.isNaN(recordedAt.getTime()) && (
                <p className="att-rec">
                  Recorded {formatEventDateTime(recordedAt)}
                </p>
              )}
            </Callout>
            {surveyUrl && (
              <p className="att-note">
                <TextLink href={surveyUrl} target="_blank" rel="noreferrer">
                  Continue to survey
                </TextLink>
              </p>
            )}
          </Card>
        )}

        {survey && <CheckInSurvey survey={survey} />}

        {!receipt?.good &&
          (options.length === 0 ? (
            <EmptyState
              title="Nothing to check in to yet"
              body="Check-in lists meetings that have started. Come back when a meeting is on."
            />
          ) : (
            <Card
              as="section"
              flat
              className="att-card"
              aria-labelledby="checkin-h"
            >
              <h2 id="checkin-h" className="h3" style={{ margin: 0 }}>
                Enter meeting code
              </h2>
              <CheckInForm
                meetings={options}
                selectedId={selected ?? options[0]!.id}
                offerSignIn={!userId || status === "uga_required"}
                problem={problem}
              />
            </Card>
          ))}

        {stars && (
          <section className="att-sect" aria-labelledby="passport-h">
            <h2 id="passport-h">Your participation passport</h2>
            <p className="muted small">
              One star for each workshop night you attend.
            </p>
            <PassportSummary totals={totalStars(stars)} streak={streak} />
            <StarGrid cells={stars} />
          </section>
        )}

        {reflectionData && (
          <ReflectionCards
            activities={reflectionData.activities}
            minimumWordCount={reflectionData.minimumWordCount}
          />
        )}
      </div>
    </PageShell>
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
