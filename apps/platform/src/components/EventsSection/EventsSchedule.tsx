"use client";

import { useCallback, useState } from "react";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import { clubDay } from "~/lib/eventTime";
import MonthCalendar from "./MonthCalendar";
import PastMeetings from "./PastMeetings";
import ScheduleList from "./ScheduleList";

interface Props {
  meetings: MeetingInRange[];
  past: MeetingSummary[];
  pastMoreCount: number;
  pastPage: number;
  now: Date;
  today: { year: number; month: number; day: number } | null;
  bounds: {
    from: { year: number; month: number };
    to: { year: number; month: number };
  };
}

/** Coordinates the two views of the schedule without making either one own
 * the other. Scrolling chooses the calendar month; pointer and keyboard focus
 * additionally identify the exact meeting to emphasize. */
export default function EventsSchedule({
  meetings,
  past,
  pastMoreCount,
  pastPage,
  now,
  today,
  bounds,
}: Props) {
  const [highlightedMeetingId, setHighlightedMeetingId] = useState<
    string | null
  >(null);
  const [calendarView, setCalendarView] = useState({
    year: today?.year ?? bounds.from.year,
    month: today?.month ?? bounds.from.month,
  });

  const followMeeting = useCallback(
    (meetingId: string | null) => {
      const meeting = meetings.find((candidate) => candidate.id === meetingId);
      if (!meeting) return;
      const { year, month } = clubDay(meeting.startsAt);
      setCalendarView((current) =>
        current.year === year && current.month === month
          ? current
          : { year, month },
      );
    },
    [meetings],
  );

  const highlightMeeting = useCallback(
    (meetingId: string | null) => {
      setHighlightedMeetingId(meetingId);
      if (meetingId !== null) followMeeting(meetingId);
    },
    [followMeeting],
  );

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-5">
      <div className="self-start lg:sticky lg:top-24 lg:col-span-2">
        <MonthCalendar
          meetings={meetings}
          now={now}
          view={calendarView}
          onViewChange={setCalendarView}
          today={today}
          bounds={bounds}
          highlightedMeetingId={highlightedMeetingId}
        />
        <div className="mt-4 flex justify-end">
          <PastMeetings
            meetings={past}
            moreCount={pastMoreCount}
            page={pastPage}
          />
        </div>
      </div>
      <div className="flex flex-col gap-10 lg:col-span-3">
        <ScheduleList
          meetings={meetings}
          now={now}
          onVisibleMeetingChange={followMeeting}
          onHighlightedMeetingChange={highlightMeeting}
        />
      </div>
    </div>
  );
}
