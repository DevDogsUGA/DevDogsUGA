"use client";

import { useCallback, useRef, useState } from "react";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import { clubDay } from "~/lib/eventTime";
import MonthCalendar from "./MonthCalendar";
import PastMeetings from "./PastMeetings";
import ScheduleList, { ScheduleFilters } from "./ScheduleList";

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
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [calendarStuck, setCalendarStuck] = useState(false);
  const [calendarView, setCalendarView] = useState({
    year: today?.year ?? bounds.from.year,
    month: today?.month ?? bounds.from.month,
  });
  const calendarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const calendarNavigationTarget = useRef<string | null>(null);

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
      if (
        calendarNavigationTarget.current !== null &&
        meetingId !== calendarNavigationTarget.current
      )
        return;
      if (meetingId === calendarNavigationTarget.current)
        calendarNavigationTarget.current = null;
      setHighlightedMeetingId(meetingId);
      if (meetingId !== null) followMeeting(meetingId);
    },
    [followMeeting],
  );

  const navigateListToRange = useCallback(
    (from: Date, to: Date): string | null => {
      const target = meetings.find((meeting) => {
        const day = clubDay(meeting.startsAt);
        const value = Date.UTC(day.year, day.month, day.day, 12);
        return value >= from.getTime() && value < to.getTime();
      });
      if (!target) return null;

      calendarNavigationTarget.current = target.id;
      setHighlightedMeetingId(target.id);
      followMeeting(target.id);

      requestAnimationFrame(() => {
        const row = listRef.current?.querySelector<HTMLElement>(
          `[data-meeting-id="${CSS.escape(target.id)}"]`,
        );
        const boundary = calendarRef.current;
        if (!row || !boundary) return;
        const heading =
          row
            .closest<HTMLElement>("[data-week-group]")
            ?.querySelector<HTMLElement>("h4") ?? row;
        const top =
          window.scrollY +
          heading.getBoundingClientRect().top -
          boundary.getBoundingClientRect().bottom -
          16;
        window.scrollTo({ top, behavior: "smooth" });
      });
      return target.id;
    },
    [followMeeting, meetings],
  );

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-10 pt-0! lg:grid-cols-5 lg:pt-4!">
      {/* On the stacked layout this is the timeline strip: it stays immediately
          below TopNav while the meeting cards travel past it. The opaque
          surface keeps those cards from showing through the calendar. */}
      <div
        ref={calendarRef}
        className="sticky top-16 z-20 self-start bg-mauve-950 pt-4 lg:top-22 lg:col-span-2 lg:pt-0"
      >
        <MonthCalendar
          meetings={meetings}
          now={now}
          view={calendarView}
          onViewChange={setCalendarView}
          today={today}
          bounds={bounds}
          highlightedMeetingId={highlightedMeetingId}
          onCompactRangeChange={navigateListToRange}
          onStickyChange={setCalendarStuck}
        />
        <div className="mt-4 flex flex-col gap-2 lg:hidden">
          <ScheduleFilters
            meetings={meetings}
            active={activeFilter}
            onChange={setActiveFilter}
          />
        </div>
        <div
          aria-hidden
          className={`-mx-6 mt-4 border-b lg:hidden ${calendarStuck ? "border-mauve-800" : "border-transparent"}`}
        />
      </div>
      <div ref={listRef} className="flex flex-col gap-10 lg:col-span-3">
        <ScheduleList
          meetings={meetings}
          now={now}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          onVisibleMeetingChange={followMeeting}
          onHighlightedMeetingChange={highlightMeeting}
          scrollBoundaryRef={calendarRef}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-mauve-400 italic">
            Plus even more, coming soon!
          </p>
          <PastMeetings
            meetings={past}
            moreCount={pastMoreCount}
            page={pastPage}
          />
        </div>
      </div>
    </div>
  );
}
