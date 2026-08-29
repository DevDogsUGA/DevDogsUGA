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
import { resolveMeetingSegments } from "~/lib/meetingSegments";
import type { SegmentBadge } from "~/components/EventsSection/meetingView";
import {
  CHIP_DARK_CLS,
  meetingBadges,
  primaryBadge,
} from "~/components/EventsSection/meetingView";
import { clubDay, formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";

/**
 * The month label. Formatted from a `Date.UTC` instant read back in UTC, so
 * the two zones cannot disagree and slip the label a month at the boundary.
 */
const monthNameFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
});

/**
 * A month as a single comparable integer, so "is this before the window's
 * first month" is one comparison rather than a year-then-month dance that has
 * to remember December is followed by January.
 */
function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

/**
 * The badge a day's dot takes.
 *
 * One dot per meeting, not one per segment — a night that judges one
 * competition and teaches another would otherwise sprout two dots and read as
 * two meetings. The segment order ranks them, so the first is the one worth
 * colouring by.
 *
 * This used to be `segments[0] ?? "open"`, which was safe when the resolver
 * guaranteed a non-empty set. It no longer does: `open` is suppressed whenever
 * an officer set a `kind`, so the segment list is empty for every authored
 * night and that fallback would quietly paint a build session with the
 * unscheduled colour — beside its own emerald chip, on the same row.
 * `primaryBadge` consults the kind first for that reason.
 */
function meetingBadge(meeting: MeetingInRange): SegmentBadge | null {
  const { segments } = resolveMeetingSegments(meeting);
  return primaryBadge({ kind: meeting.kind, segments });
}

function MeetingDetail({ meeting }: { meeting: MeetingInRange }) {
  const { segments } = resolveMeetingSegments(meeting);
  // Derived chips and the officer's kind, composed in one place rather than
  // here: a night an officer named has no segments at all, so a band that
  // rendered only the derived set would show it nothing.
  const badges = meetingBadges({ kind: meeting.kind, segments });

  return (
    <div className="flex w-56 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {badges.map((badge) => (
          <span
            key={badge.label}
            className={`${badge.chipDark} ${CHIP_DARK_CLS}`}
          >
            {badge.label}
          </span>
        ))}
      </div>
      {/* The date leads, because it is the one field guaranteed to be here and
          because you arrived by hovering a specific square — it confirms which
          one. A name appears BELOW it and only when an officer wrote one,
          which is what makes Cold Start and Midterm Study Session stand out in
          a month of nights that carry no title at all. */}
      <p className="font-display leading-tight font-extrabold text-white">
        {formatEventSpan(meeting.startsAt, meeting.endsAt)}
      </p>
      {meeting.nameOverride !== null && (
        <p className="text-sm leading-tight font-semibold text-white">
          {meeting.nameOverride}
        </p>
      )}
      {meeting.location !== null && (
        <p className="text-xs/snug text-mauve-400">{meeting.location}</p>
      )}
      {meeting.summary !== null && (
        <p className="border-t border-white/10 pt-2 text-xs/relaxed text-mauve-300">
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
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-white hover:underline"
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
            className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-white transition-colors hover:bg-white/10 ${activeMeeting?.id === meeting.id ? "bg-white/10" : ""}`}
            onMouseEnter={() => handleEnter(meeting, idx)}
            // Focus reveals the same pane hover does, so tabbing through the
            // list is not a walk past buttons that visibly do nothing.
            onFocus={() => handleEnter(meeting, idx)}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`size-1.5 shrink-0 rounded-full ${meetingBadge(meeting)?.dotDark ?? "bg-mauve-400"}`}
              />
              {/* This is a LIST of the day's meetings, so it needs a name for
                  each — the popover's date-first treatment would print the
                  same date twice over. `meetingTitle` falls back through the
                  kind to the date, and never returns empty. */}
              {meetingTitle(meeting)}
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
            <div className="relative ml-2 overflow-hidden border-l border-white/10 pl-3">
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
  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-mauve-600 bg-mauve-800 text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:border-mauve-800 disabled:text-mauve-600 disabled:hover:border-mauve-800";

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

  // The legend for the month on screen: one entry per DISTINCT dot colour
  // actually drawn, in the order the dots first appear down the grid, so
  // reading it top to bottom matches reading the month top to bottom.
  // Deduplicated by label rather than by segment, because two different
  // sources — a segment and an officer's `kind` — can produce one badge.
  const visibleLegend: SegmentBadge[] = [];
  const seenLegend = new Set<string>();
  for (const day of [...meetingsByDay.keys()].sort((a, b) => a - b)) {
    for (const meeting of meetingsByDay.get(day) ?? []) {
      const badge = meetingBadge(meeting);
      if (badge === null || seenLegend.has(badge.label)) continue;
      seenLegend.add(badge.label);
      visibleLegend.push(badge);
    }
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
        // No frame of its own: the console card this sits in is the frame.
        className="flex flex-col gap-4"
        onMouseEnter={() => clearTimeout(closeTimer.current)}
        onMouseLeave={handleClose}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Live so a keyboard user who just pressed Previous hears which
              month they landed on — the grid below re-renders silently. */}
          <h3 aria-live="polite" className="font-display font-bold text-white">
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
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-bold text-mauve-400">
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
                        className={`size-1 rounded-full ${meetingBadge(meeting)?.dotDark ?? "bg-mauve-400"}`}
                      />
                    ))}
                  </div>
                )}
              </>
            );

            const baseClass = `flex h-8.5 flex-col items-center justify-start py-1.5 text-xs ${day === todayDay ? "font-black text-white" : "text-mauve-300"} ${!day ? "invisible" : ""}`;

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
                className={`${baseClass} relative cursor-pointer rounded before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-[''] hover:bg-white/10`}
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
        {/* Derived from the meetings actually on THIS month's grid rather than
            from a fixed list, so a hue appears in the legend exactly when it
            appears as a dot. A fixed list has to guess, and it guesses wrong in
            both directions: it explained "Judging" in rose on months whose
            every judging night also taught something — workshop sorts first
            now, so the dot is never rose — and it could never mention a build
            session, whose colour comes from an officer's `kind` rather than
            from the segment union. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-mauve-400">
          {visibleLegend.length === 0 ? (
            <span className="text-mauve-500">No events this month</span>
          ) : (
            visibleLegend.map((badge) => (
              <span key={badge.label} className="flex items-center gap-1.5">
                <span
                  className={`inline-block size-2 rounded-full ${badge.dotDark}`}
                />
                {badge.label}
              </span>
            ))
          )}
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
                <div className="rounded-lg border border-mauve-600 bg-mauve-800 p-3 text-sm shadow-2xl shadow-black/60">
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
