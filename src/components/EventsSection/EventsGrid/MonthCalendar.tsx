"use client";

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
import { ArrowUpRightIcon, CalendarDotsIcon, CaretRightIcon, ClockIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import { parseISO } from "date-fns";
import type { CalendarEvent, EventType } from "~/app/(navbar)/homeData";
import { formatEventTime } from "~/app/(navbar)/homeData";

const dotColor: Record<EventType, string> = {
  hackathon: "bg-cyan-500",
  workshop: "bg-amber-400",
  devhours: "bg-mauve-800",
  career: "bg-emerald-700",
};

const badgeStyle: Record<
  EventType,
  { bg: string; text: string; label: string }
> = {
  hackathon: { bg: "bg-cyan-400", text: "text-black", label: "Hackathon" },
  workshop: { bg: "bg-amber-400", text: "text-black", label: "Workshop" },
  devhours: { bg: "bg-mauve-800", text: "text-white", label: "Dev Hours" },
  career: { bg: "bg-emerald-800", text: "text-white", label: "Career" },
};

function EventDetail({ event }: { event: CalendarEvent }) {
  const badge = badgeStyle[event.type];
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
      <div className="flex flex-col gap-1 border-t border-mauve-200 pt-2 text-xs text-mauve-500">
        <span className="flex items-center gap-1.5">
          <ClockIcon className="shrink-0" />
          {formatEventTime(event.start, event.end)}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPinIcon className="shrink-0" />
          {event.location}
        </span>
        {event.rsvpUrl && (
          <a
            href={event.rsvpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 font-semibold text-black hover:underline"
          >
            RSVP <ArrowUpRightIcon />
          </a>
        )}
      </div>
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
  events: CalendarEvent[];
  onEventTypeHover: (type: EventType | null) => void;
}

export default function MonthCalendar({ events, onEventTypeHover }: Props) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = now.getDate();

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
    const d = parseISO(event.start).getDate();
    const eventMonth = parseISO(event.start).getMonth();
    if (eventMonth !== month) continue;
    eventsByDay.set(d, [...(eventsByDay.get(d) ?? []), event]);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dir = enterDir.current;

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
                className={`${baseClass} cursor-pointer rounded hover:bg-mauve-50`}
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
            Hackathon
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-amber-400" />{" "}
            Workshop
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-mauve-800" />{" "}
            Dev Hours
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
              initialFocus={openedByMouse.current ? -1 : 0}
              returnFocus={!openedByMouse.current}
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
                  x: approxInitialPos.current.x,
                  y: approxInitialPos.current.y,
                  opacity: 0,
                  scale: 0.97,
                }}
                animate={{
                  x: x ?? approxInitialPos.current.x,
                  y: y ?? approxInitialPos.current.y,
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
