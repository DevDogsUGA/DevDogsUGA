"use client";

/* eslint-disable react-hooks/refs --
   This animated calendar popover deliberately reads imperative state
   (hover direction, initial position, mouse-vs-keyboard open) from refs during
   render to drive the open/close motion. Moving it to state would re-render and
   fight the animation. */

/* eslint-disable @typescript-eslint/unbound-method --
   `refs.setFloating` (below) is a stable, already-bound setter from
   @floating-ui/react and is documented to be passed straight to `ref`. The rule
   cannot see that. The alternatives are worse: wrapping it in an arrow gives the
   ref a new identity every render, so React detaches and reattaches it each
   time, which fights `autoUpdate` and the open/close animation. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react/ssr";
import type { MeetingInRange } from "~/server/loaders/meetings";
import type { MeetingSegment } from "~/lib/meetingSegments";
import { resolveMeetingSegments } from "~/lib/meetingSegments";
import {
  CHIP_CLS,
  SEGMENT_LEGEND,
  segmentBadge,
} from "~/components/EventsSection/meetingView";
import { EVENT_TZ, formatEventSpan } from "~/lib/eventTime";

/**
 * Which calendar square a meeting belongs in, in the CLUB's zone.
 *
 * Postgres hands back a `Date`, which is an instant with no zone of its own,
 * and `getDate()` answers in whatever zone the code is running in. A 6pm
 * Athens meeting is already tomorrow in UTC, so asking the `Date` directly
 * files it under the wrong square for every viewer east of here — and under a
 * *different* wrong square during SSR than during hydration, which is a
 * hydration mismatch on top of a wrong answer.
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is pure — unlike
 * `@date-fns/tz`, whose `TZDate` constructor reads the clock and would drop
 * this whole page out of the prerendered shell (see docs/platform/caching.md,
 * "Clock reads in client components"). It gives byte-identical answers on the
 * server and in the browser regardless of where either one sits.
 *
 * Built once at module scope: constructing a formatter is the expensive part
 * and this one has no per-render inputs, so rebuilding it per cell would pay
 * that cost dozens of times a render for an identical object.
 */
const dayPartsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/**
 * The month label. Formatted from a `Date.UTC` instant read back in UTC, so
 * the two zones cannot disagree and slip the label a month at the boundary.
 */
const monthNameFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
});

/** `{ year, month, day }` with a 0-indexed month, matching `Date#getMonth`. */
function clubDay(at: Date): { year: number; month: number; day: number } {
  let year = 0;
  let month = 1;
  let day = 1;
  // `formatToParts` rather than parsing the formatted string: the separator
  // and field order are ICU's to change, and a `split("/")` would quietly
  // start bucketing meetings into the wrong month if it ever did.
  for (const part of dayPartsFormat.formatToParts(at)) {
    if (part.type === "year") year = Number(part.value);
    else if (part.type === "month") month = Number(part.value);
    else if (part.type === "day") day = Number(part.value);
  }
  return { year, month: month - 1, day };
}

/**
 * A month as a single comparable integer, so "is this before the window's
 * first month" is one comparison rather than a year-then-month dance that has
 * to remember December is followed by January.
 */
function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

/**
 * The colour a day's dot takes: the meeting's PRIMARY segment.
 *
 * One dot per meeting, not one per segment — a night that judges one
 * competition and teaches another would otherwise sprout two dots and read as
 * two meetings. `resolveMeetingSegments` orders the set by
 * consequence-of-missing-it, so the first is the one worth colouring by.
 */
function primarySegment(meeting: MeetingInRange): MeetingSegment {
  // The resolver never returns an empty set — `open` is its structural
  // fallback — but `noUncheckedIndexedAccess` cannot know that, and repeating
  // the fallback here is cheaper than an assertion that could go stale.
  return resolveMeetingSegments(meeting).segments[0] ?? "open";
}

function MeetingDetail({ meeting }: { meeting: MeetingInRange }) {
  const { segments, kindOverride } = resolveMeetingSegments(meeting);

  return (
    <div className="flex w-56 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((segment) => {
          const badge = segmentBadge[segment];
          return (
            <span
              key={segment}
              className={`${badge.bg} ${badge.text} ${CHIP_CLS}`}
            >
              {badge.label}
            </span>
          );
        })}
        {/* Rendered alongside the derived segments rather than instead of
            them: a social that also runs a workshop is a real night, and
            showing only the override would quietly drop the workshop. Printed
            verbatim in a neutral chip because `kind` is an Airtable
            single-select an officer can extend without touching this repo. */}
        {kindOverride !== null && (
          <span
            className={`border-2 border-black bg-white text-black ${CHIP_CLS}`}
          >
            {kindOverride}
          </span>
        )}
      </div>
      <p className="font-display leading-tight font-extrabold text-black">
        {meeting.name}
      </p>
      {/* A dated row, so it says when this one is. The old fabricated events
          carried a recurrence rule and printed "Weekly on Mondays"; real
          meetings are individual rows and there is no rule to state. */}
      <p className="text-xs/snug font-semibold text-black">
        {formatEventSpan(meeting.startsAt, meeting.endsAt)}
      </p>
      {meeting.location !== null && (
        <p className="text-xs/snug text-mauve-500">{meeting.location}</p>
      )}
      {meeting.summary !== null && (
        <p className="border-t border-mauve-200 pt-2 text-xs/relaxed text-mauve-600">
          {meeting.summary}
        </p>
      )}
      {/* `Link`, not `a` — `/events/[slug]` is a route dialog whose frame is a
          nested layout over the calendar (see its `layout.tsx`). A client
          navigation opens it over what is already on screen and gets the
          hover prefetch of that frame; a plain anchor throws the page away and
          reloads the whole route. */}
      <Link
        href={`/events/${meeting.slug}`}
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-black hover:underline"
      >
        Event details <ArrowUpRightIcon />
      </Link>
    </div>
  );
}

/**
 * Two meetings on one day is rare but legal, so the popover keeps its
 * list-plus-detail split rather than stacking both details and growing past
 * the viewport.
 */
function MultiMeetingMenu({ meetings }: { meetings: MeetingInRange[] }) {
  const [activeMeeting, setActiveMeeting] = useState<MeetingInRange | null>(
    null,
  );
  const lastIdxRef = useRef<number | null>(null);
  const dirRef = useRef(0);

  function handleEnter(meeting: MeetingInRange, idx: number) {
    const prev = lastIdxRef.current;
    dirRef.current = prev === null ? 0 : idx > prev ? 1 : -1;
    lastIdxRef.current = idx;
    setActiveMeeting(meeting);
  }

  function handleLeave() {
    lastIdxRef.current = null;
    dirRef.current = 0;
    setActiveMeeting(null);
  }

  const dir = dirRef.current;

  return (
    <div className="flex gap-0" onMouseLeave={handleLeave}>
      <div className="flex min-w-44 flex-col gap-0.5" role="menu">
        {meetings.map((meeting, idx) => (
          <button
            key={meeting.id}
            type="button"
            role="menuitem"
            className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-black transition-colors hover:bg-mauve-50 ${activeMeeting?.id === meeting.id ? "bg-mauve-50" : ""}`}
            onMouseEnter={() => handleEnter(meeting, idx)}
            // Focus reveals the same pane hover does, so tabbing through the
            // list is not a walk past buttons that visibly do nothing.
            onFocus={() => handleEnter(meeting, idx)}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`size-1.5 shrink-0 rounded-full ${segmentBadge[primarySegment(meeting)].dot}`}
              />
              {meeting.name}
            </span>
            <CaretRightIcon className="shrink-0 text-mauve-400" />
          </button>
        ))}
      </div>
      <AnimatePresence>
        {activeMeeting && (
          <motion.div
            key="detail-pane"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            style={{ overflow: "hidden" }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="relative ml-2 overflow-hidden border-l border-mauve-200 pl-3">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={activeMeeting.id}
                  initial={{ y: `${dir * 100}%` }}
                  animate={{ y: 0 }}
                  exit={{ y: `${-dir * 100}%` }}
                  transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                >
                  <MeetingDetail meeting={activeMeeting} />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const PAGE_BUTTON_CLS =
  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm border-2 border-black bg-white text-black transition-colors hover:bg-mauve-50 disabled:cursor-not-allowed disabled:border-mauve-300 disabled:text-mauve-300 disabled:hover:bg-white";

interface Props {
  /** Every meeting in the loaded window, ascending. Usually three months. */
  meetings: MeetingInRange[];
  /** Which month to show first. 0-indexed month, matching Date#getMonth. */
  initialYear: number;
  initialMonth: number;
  /** Today, in the club's timezone, for the "today" highlight. Null when
   *  today falls outside the loaded window. */
  today: { year: number; month: number; day: number } | null;
  /** Inclusive bounds of the loaded window, so paging can stop at the edge. */
  bounds: {
    from: { year: number; month: number };
    to: { year: number; month: number };
  };
}

export default function MonthCalendar({
  meetings,
  initialYear,
  initialMonth,
  today,
  bounds,
}: Props) {
  // Which month the grid draws. Seeded from props — resolved server-side, not
  // read from the clock here. A client component's SSR pass cannot sit inside
  // a `"use cache"` scope, so any clock read here would silently drop the page
  // out of the prerendered shell, and would let SSR and hydration disagree
  // about what month it is.
  const [view, setView] = useState({ year: initialYear, month: initialMonth });
  const { year, month } = view;

  const viewIdx = monthIndex(year, month);
  const fromIdx = monthIndex(bounds.from.year, bounds.from.month);
  const toIdx = monthIndex(bounds.to.year, bounds.to.month);
  const canGoBack = viewIdx > fromIdx;
  const canGoForward = viewIdx < toIdx;

  // Grid maths on explicit values via `Date.UTC`, read back with the `getUTC*`
  // accessors. A bare `new Date(year, month, 1)` would be built in the
  // viewer's zone and is one DST boundary away from disagreeing with itself;
  // it is also the shape that tempts a `new Date()` to creep back in.
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthName = monthNameFormat.format(monthStart);
  // Day 0 of the following month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDayOfWeek = monthStart.getUTCDay();

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<{
    day: number;
    meetings: MeetingInRange[];
  } | null>(null);

  const openedByMouse = useRef(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const enterDir = useRef(0);
  const prevCellY = useRef<number | null>(null);
  const approxInitialPos = useRef({ x: 0, y: 0 });

  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    },
    [],
  );

  const { refs, x, y, strategy, context, isPositioned } = useFloating({
    placement: "right-start",
    open,
    onOpenChange: (v) => {
      if (!v) closeImmediate();
    },
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  function openWith(
    day: number,
    el: HTMLElement,
    dayMeetings: MeetingInRange[],
    byMouse: boolean,
  ) {
    const rect = el.getBoundingClientRect();
    if (open && prevCellY.current !== null) {
      enterDir.current = rect.top > prevCellY.current ? 1 : -1;
    } else {
      enterDir.current = 0;
    }
    prevCellY.current = rect.top;
    approxInitialPos.current = { x: rect.right + 6, y: rect.top };
    refs.setReference(el);
    openedByMouse.current = byMouse;
    setActive({ day, meetings: dayMeetings });
    setOpen(true);
  }

  function handleCellEnter(
    day: number,
    el: HTMLElement,
    dayMeetings: MeetingInRange[],
  ) {
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    clearTimeout(closeTimer.current);
    const delay = open ? 0 : 200;
    openTimer.current = setTimeout(
      () => openWith(day, el, dayMeetings, true),
      delay,
    );
  }

  function handleCellFocus(
    day: number,
    el: HTMLElement,
    dayMeetings: MeetingInRange[],
  ) {
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openWith(day, el, dayMeetings, false);
  }

  function handleClose() {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      prevCellY.current = null;
      enterDir.current = 0;
    }, 300);
  }

  function closeImmediate() {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    prevCellY.current = null;
    enterDir.current = 0;
    setOpen(false);
  }

  /**
   * Page by `delta` months, clamped to the loaded window.
   *
   * No fetch: the whole window — usually three months — arrives in `meetings`,
   * so paging is a re-slice of data already in hand. The clamp is belt and
   * braces over the `disabled` attributes, which a keyboard cannot get past
   * but a stale render could.
   */
  function stepMonth(delta: number) {
    const next = Math.min(Math.max(viewIdx + delta, fromIdx), toIdx);
    if (next === viewIdx) return;
    // The open popover's reference element is a cell that is about to
    // unmount; leaving it open would strand the popover mid-air over a month
    // it no longer describes.
    closeImmediate();
    setView({ year: Math.floor(next / 12), month: next % 12 });
  }

  const meetingsByDay = new Map<number, MeetingInRange[]>();
  for (const meeting of meetings) {
    // Bucketed by the club's zone, not the ambient one — see `clubDay`. The
    // year is compared too: the window spans months, and December 2026 and
    // December 2027 are not the same squares.
    const at = clubDay(meeting.startsAt);
    if (at.year !== year || at.month !== month) continue;
    // `meetings` is ascending, so pushing preserves the order within a day.
    meetingsByDay.set(at.day, [...(meetingsByDay.get(at.day) ?? []), meeting]);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Today only lights up when the grid is actually showing today's month, so
  // paging away does not leave a stray highlight on the same square number.
  const todayDay =
    today !== null && today.year === year && today.month === month
      ? today.day
      : null;

  // Imperative animation state, read once per render (see the file-level note).
  const dir = enterDir.current;
  const openedByMouseNow = openedByMouse.current;
  const approxPos = approxInitialPos.current;

  return (
    <>
      <div
        // A ruled panel rather than a box: the top rule matches the rows and
        // the table beside it, so the three read as one section.
        className="flex flex-col gap-4 border-t-2 border-black pt-4"
        onMouseEnter={() => clearTimeout(closeTimer.current)}
        onMouseLeave={handleClose}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Live so a keyboard user who just pressed Previous hears which
              month they landed on — the grid below re-renders silently. */}
          <h3 aria-live="polite" className="font-display font-bold text-black">
            {monthName} {year}
          </h3>
          {/* Real buttons with their own labels, not icon-only div handlers:
              the caret alone has no accessible name, and the calendar icon
              that used to sit here was decoration this slot can no longer
              afford at 390px. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={PAGE_BUTTON_CLS}
              onClick={() => stepMonth(-1)}
              disabled={!canGoBack}
              aria-label="Previous month"
            >
              <CaretLeftIcon aria-hidden />
            </button>
            <button
              type="button"
              className={PAGE_BUTTON_CLS}
              onClick={() => stepMonth(1)}
              disabled={!canGoForward}
              aria-label="Next month"
            >
              <CaretRightIcon aria-hidden />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-bold text-mauve-500">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {cells.map((day, idx) => {
            const dayMeetings = day ? (meetingsByDay.get(day) ?? []) : [];

            const cellContent = (
              <>
                <span>{day ?? ""}</span>
                {dayMeetings.length > 0 && (
                  <div className="mt-0.5 flex gap-0.5">
                    {dayMeetings.map((meeting) => (
                      <span
                        key={meeting.id}
                        className={`size-1 rounded-full ${segmentBadge[primarySegment(meeting)].dot}`}
                      />
                    ))}
                  </div>
                )}
              </>
            );

            const baseClass = `flex h-8.5 flex-col items-center justify-start py-1.5 text-xs ${day === todayDay ? "font-black text-black" : "text-mauve-700"} ${!day ? "invisible" : ""}`;

            if (dayMeetings.length === 0 || !day) {
              return (
                <div key={idx} className={baseClass}>
                  {cellContent}
                </div>
              );
            }

            return (
              <button
                // Keyed by month as well as position: paging reuses the same
                // 42 slots, and a bare index would let React keep a focused
                // cell mounted across a month change with new contents.
                key={`${year}-${month}-${idx}`}
                type="button"
                className={`${baseClass} relative cursor-pointer rounded before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-[''] hover:bg-mauve-50`}
                aria-expanded={open && active?.day === day}
                aria-haspopup="dialog"
                onMouseEnter={(e) =>
                  handleCellEnter(day, e.currentTarget, dayMeetings)
                }
                onFocus={(e) =>
                  handleCellFocus(day, e.currentTarget, dayMeetings)
                }
                onBlur={handleClose}
              >
                {cellContent}
              </button>
            );
          })}
        </div>
        {/* Built from SEGMENT_LEGEND rather than hardcoded, so the legend and
            the dots it explains cannot drift apart — and so a segment added to
            the model shows up here without anybody remembering to add it. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-mauve-200 pt-3 text-xs text-mauve-600">
          {SEGMENT_LEGEND.map((segment) => (
            <span key={segment} className="flex items-center gap-1.5">
              <span
                className={`inline-block size-2 rounded-full ${segmentBadge[segment].dot}`}
              />
              {segmentBadge[segment].label}
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <FloatingPortal>
            <FloatingFocusManager
              context={context}
              modal={false}
              initialFocus={openedByMouseNow ? -1 : 0}
              returnFocus={!openedByMouseNow}
            >
              <motion.div
                ref={refs.setFloating}
                {...getFloatingProps()}
                tabIndex={-1}
                style={{
                  position: strategy,
                  top: 0,
                  left: 0,
                  zIndex: 50,
                  outline: "none",
                }}
                initial={{
                  x: approxPos.x,
                  y: approxPos.y,
                  opacity: 0,
                  scale: 0.97,
                }}
                animate={{
                  x: x ?? approxPos.x,
                  y: y ?? approxPos.y,
                  opacity: isPositioned ? 1 : 0,
                  scale: isPositioned ? 1 : 0.97,
                }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{
                  x: { type: "spring", stiffness: 380, damping: 28 },
                  y: { type: "spring", stiffness: 380, damping: 28 },
                  opacity: { duration: 0.15, ease: "easeOut" },
                  scale: { duration: 0.15, ease: "easeOut" },
                }}
                onMouseEnter={() => clearTimeout(closeTimer.current)}
                onMouseLeave={handleClose}
              >
                <div className="shadow-block-md rounded-sm border-2 border-black bg-white p-3 text-sm">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={`${year}-${month}-${active?.day}`}
                      initial={{ opacity: 0, y: dir * 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -dir * 8 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      {active &&
                        (active.meetings.length === 1 ? (
                          <MeetingDetail meeting={active.meetings[0]!} />
                        ) : (
                          <MultiMeetingMenu meetings={active.meetings} />
                        ))}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            </FloatingFocusManager>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </>
  );
}
