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
  CalendarDotsIcon,
  CaretRightIcon,
  ClockIcon,
} from "@phosphor-icons/react/ssr";
import type {
  CalendarEvent,
  CalendarMonth,
  EventType,
} from "~/app/(site)/homeData";
import { eventLocalDay, formatRecurrence } from "~/app/(site)/homeData";
import { dotColor, eventBadge } from "./eventBadge";

function EventDetail({ event }: { event: CalendarEvent }) {
  const badge = eventBadge[event.type];
  return (
    <div className="flex w-52 flex-col gap-2">
      <span
        className={`${badge.bg} ${badge.text} w-fit rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase`}
      >
        {badge.label}
      </span>
      <p className="font-display leading-tight font-extrabold text-black">
        {event.title}
      </p>
      <p className="text-xs/relaxed text-mauve-600">{event.description}</p>
      {event.recurring && (
        <p className="flex items-center gap-1.5 border-t border-mauve-200 pt-2 text-xs/snug font-semibold text-black">
          <ClockIcon className="shrink-0 text-mauve-500" />
          {formatRecurrence(event.start, event.end)}
        </p>
      )}
      {event.steps && (
        <ol
          className={`flex flex-col gap-1.5 text-xs/snug text-mauve-600 ${event.recurring ? "" : "border-t border-mauve-200 pt-2"}`}
        >
          {event.steps.map((step, i) => (
            <li key={step} className="flex items-start gap-2">
              <span
                aria-hidden
                className={`${badge.bg} ${badge.text} mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold`}
              >
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}
      {event.rsvpUrl && (
        <a
          href={event.rsvpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-black hover:underline"
        >
          RSVP <ArrowUpRightIcon />
        </a>
      )}
    </div>
  );
}

function MultiEventMenu({
  events,
  onEventTypeHover,
}: {
  events: CalendarEvent[];
  onEventTypeHover: (type: EventType | null) => void;
}) {
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const lastIdxRef = useRef<number | null>(null);
  const dirRef = useRef(0);

  function handleEnter(event: CalendarEvent, idx: number) {
    const prev = lastIdxRef.current;
    dirRef.current = prev === null ? 0 : idx > prev ? 1 : -1;
    lastIdxRef.current = idx;
    setActiveEvent(event);
    onEventTypeHover(event.type);
  }

  function handleLeave() {
    lastIdxRef.current = null;
    dirRef.current = 0;
    setActiveEvent(null);
    onEventTypeHover(null);
  }

  const dir = dirRef.current;

  return (
    <div className="flex gap-0" onMouseLeave={handleLeave}>
      <div className="flex min-w-44 flex-col gap-0.5" role="menu">
        {events.map((event, idx) => (
          <button
            key={event.id}
            role="menuitem"
            className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-black transition-colors hover:bg-mauve-50 ${activeEvent?.id === event.id ? "bg-mauve-50" : ""}`}
            onMouseEnter={() => handleEnter(event, idx)}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`size-1.5 shrink-0 rounded-full ${dotColor[event.type]}`}
              />
              {event.title}
            </span>
            <CaretRightIcon className="shrink-0 text-mauve-400" />
          </button>
        ))}
      </div>
      <AnimatePresence>
        {activeEvent && (
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
                  key={activeEvent.id}
                  initial={{ y: `${dir * 100}%` }}
                  animate={{ y: 0 }}
                  exit={{ y: `${-dir * 100}%` }}
                  transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                >
                  <EventDetail event={activeEvent} />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface Props {
  month: CalendarMonth;
  onEventTypeHover: (type: EventType | null) => void;
}

export default function MonthCalendar({
  month: frame,
  onEventTypeHover,
}: Props) {
  // The year/month/today the grid draws are resolved server-side (see
  // getCalendarMonth) rather than read from the clock here. A client
  // component's SSR pass cannot sit inside a `"use cache"` scope, so any clock
  // read here would silently drop the whole homepage out of the prerendered
  // shell — and would let SSR and hydration disagree about what month it is.
  const { events, year, month, today } = frame;
  // Built from components, so this is the same string in any time zone.
  const monthName = new Date(year, month, 1).toLocaleString("en-US", {
    month: "long",
  });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<{
    day: number;
    events: CalendarEvent[];
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
    dayEvents: CalendarEvent[],
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
    setActive({ day, events: dayEvents });
    setOpen(true);
    if (dayEvents.length === 1) onEventTypeHover(dayEvents[0]!.type);
  }

  function handleCellEnter(
    day: number,
    el: HTMLElement,
    dayEvents: CalendarEvent[],
  ) {
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    clearTimeout(closeTimer.current);
    const delay = open ? 0 : 200;
    openTimer.current = setTimeout(
      () => openWith(day, el, dayEvents, true),
      delay,
    );
  }

  function handleCellFocus(
    day: number,
    el: HTMLElement,
    dayEvents: CalendarEvent[],
  ) {
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openWith(day, el, dayEvents, false);
  }

  function handleClose() {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      onEventTypeHover(null);
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
    onEventTypeHover(null);
  }

  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const event of events) {
    // Bucketed by the event's own zone, not the ambient one — an evening event
    // is already the next day in UTC, so parsing locally would file it under a
    // different square on the server than in the browser.
    const { month: eventMonth, day } = eventLocalDay(event.start);
    if (eventMonth !== month) continue;
    eventsByDay.set(day, [...(eventsByDay.get(day) ?? []), event]);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Imperative animation state, read once per render (see the file-level note).
  const dir = enterDir.current;
  const openedByMouseNow = openedByMouse.current;
  const approxPos = approxInitialPos.current;

  return (
    <>
      <div
        className="shadow-block-lg flex flex-col gap-4 rounded-sm border-2 border-black bg-white p-4"
        onMouseEnter={() => clearTimeout(closeTimer.current)}
        onMouseLeave={handleClose}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-black">
            {monthName} {year}
          </h3>
          <CalendarDotsIcon className="text-mauve-500" />
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
            const dayEvents = day ? (eventsByDay.get(day) ?? []) : [];

            const cellContent = (
              <>
                <span>{day ?? ""}</span>
                {dayEvents.length > 0 && (
                  <div className="mt-0.5 flex gap-0.5">
                    {dayEvents.map((e) => (
                      <span
                        key={e.id}
                        className={`size-1 rounded-full ${dotColor[e.type]}`}
                      />
                    ))}
                  </div>
                )}
              </>
            );

            const baseClass = `flex h-8.5 flex-col items-center justify-start py-1.5 text-xs ${day === today ? "font-black text-black" : "text-mauve-700"} ${!day ? "invisible" : ""}`;

            if (dayEvents.length === 0 || !day) {
              return (
                <div key={idx} className={baseClass}>
                  {cellContent}
                </div>
              );
            }

            return (
              <button
                key={idx}
                className={`${baseClass} relative cursor-pointer rounded before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-[''] hover:bg-mauve-50`}
                aria-expanded={open && active?.day === day}
                aria-haspopup="dialog"
                onMouseEnter={(e) =>
                  handleCellEnter(day, e.currentTarget, dayEvents)
                }
                onFocus={(e) =>
                  handleCellFocus(day, e.currentTarget, dayEvents)
                }
                onBlur={handleClose}
              >
                {cellContent}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-mauve-200 pt-3 text-xs text-mauve-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-cyan-500" />{" "}
            Competition
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-amber-400" />{" "}
            Workshop
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-mauve-800" />{" "}
            Build Session
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-emerald-700" />{" "}
            Career
          </span>
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
                      key={active?.day}
                      initial={{ opacity: 0, y: dir * 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -dir * 8 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      {active &&
                        (active.events.length === 1 ? (
                          <EventDetail event={active.events[0]!} />
                        ) : (
                          <MultiEventMenu
                            events={active.events}
                            onEventTypeHover={onEventTypeHover}
                          />
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
