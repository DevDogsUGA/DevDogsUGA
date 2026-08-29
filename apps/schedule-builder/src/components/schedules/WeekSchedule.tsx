"use client";

import { type WeekSchedule as WeekScheduleType } from "~/types/scheduleTypes";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDoubleRightIcon } from "@phosphor-icons/react/ssr";
import DayClass from "./DayClass";
import { SCHEDULE_END_HOUR, SCHEDULE_START_HOUR } from "~/lib/schedule-display";

interface WeekScheduleProps {
  weekData: WeekScheduleType;
}

export default function WeekSchedule({ weekData }: WeekScheduleProps) {
  const scrollportRef = useRef<HTMLElement>(null);
  const [next, setNext] = useState<string | undefined>(undefined);
  const [prev, setPrev] = useState<string | undefined>(undefined);

  /**
   * Handler updating next/prev scroll buttons for scroll/resize events.
   */
  const handleScroll = useCallback(function (this: HTMLElement) {
    const bounds = this.getBoundingClientRect();
    const children = [...this.children];

    setPrev(
      children
        .findLast((child) => child.getBoundingClientRect().left < 0)
        ?.getAttribute("data-title") ?? undefined,
    );

    setNext(
      children
        .find((child) => child.getBoundingClientRect().left > bounds.width)
        ?.getAttribute("data-title") ?? undefined,
    );
  }, []);

  /**
   * Scroll scrollport left by one day.
   */
  const scrollLeft = useCallback(() => {
    if (scrollportRef.current === null) {
      return;
    }

    const scrollport = scrollportRef.current;
    const target = scrollport.querySelector(":last-of-type")!;
    scrollport.scrollLeft -= target.clientWidth;
  }, []);

  /**
   * Scroll scrollport right by one day.
   */
  const scrollRight = useCallback(() => {
    if (scrollportRef.current === null) {
      return;
    }

    const scrollport = scrollportRef.current;
    const target = scrollport.querySelector(":last-of-type")!;
    scrollport.scrollLeft += target.clientWidth;
  }, []);

  // Setup/cleanup for scroll/resize events.
  useEffect(() => {
    if (!("window" in globalThis) || scrollportRef.current === null) {
      return;
    }

    const controller = new AbortController();

    handleScroll.apply(scrollportRef.current);

    scrollportRef.current.addEventListener("scroll", handleScroll, controller);

    window.addEventListener(
      "resize",
      handleScroll.bind(scrollportRef.current),
      controller,
    );

    return () => controller.abort();
  }, [handleScroll]);

  /*
   * Create lines for each hour under each day. (8AM to 10PM)
   */
  const createHourlySections = useCallback(() => {
    const sections = [];
    const startHour = SCHEDULE_START_HOUR;
    const endHour = SCHEDULE_END_HOUR;
    const totalHours = endHour - startHour + 1;
    const sectionHeight = 50 / totalHours;

    for (let hour = startHour; hour <= endHour; hour++) {
      // convert 24-hour to am/pm
      const ampm = hour > 12 ? hour - 12 : hour;
      const period = hour >= 12 ? "PM" : "AM";
      sections.push(
        <div
          key={hour}
          className="h- relative w-full border-t border-gray-300"
          style={{
            height: `${sectionHeight}%`,
            top: `${(hour - startHour) * sectionHeight}%`,
            zIndex: 0, // lines stay behind course blocks
          }}
        >
          <span className="absolute left-0 px-4 text-sm text-gray-500">
            <div>
              <span className="font-bold">{ampm}</span> {period}
            </div>
          </span>
        </div>,
      );
    }

    return sections;
  }, []);

  return (
    <div className="relative z-0 mx-auto w-screen max-w-[1800px] overflow-x-hidden px-4">
      <button
        className="absolute top-0 left-0 z-10 flex h-full w-8 rotate-180 items-center justify-between rounded-r-lg border-l-2 border-pink-900 bg-pink-50 py-4 text-center font-bold text-pink-900 transition-[left] [writing-mode:vertical-lr] 2xl:hidden [&:not([data-scroll-target])]:-left-8"
        data-scroll-target={prev}
        onClick={scrollLeft}
        type="button"
      >
        <CaretDoubleRightIcon weight="bold" />
        {prev}
        <CaretDoubleRightIcon weight="bold" />
      </button>

      {/* Viewport of schedule display */}
      <section
        className="grid h-[750px] w-full snap-x snap-mandatory grid-cols-[1rem_repeat(5,calc((100%-1rem)/var(--cols)))] overflow-x-auto scroll-smooth rounded-lg bg-pink-200/50 py-4 [--cols:1] sm:[--cols:2] md:overflow-hidden lg:[--cols:3] xl:[--cols:4] 2xl:[--cols:5]"
        ref={scrollportRef}
      >
        <div />

        {Object.entries(weekData).map(([day, classes]) => (
          <div className="snap-end snap-always pr-4" data-title={day} key={day}>
            {/* One day's schedule */}
            <article className="flex h-full w-full flex-col gap-4 rounded-xl bg-white px-0 py-0">
              {/* Day label */}
              <h2 className="text rounded-lg bg-[#222233] px-4 py-3 text-center text-xl font-bold text-white">
                {day}
              </h2>
              {/* Class list */}
              <div className="relative h-full">
                {createHourlySections()}
                {classes.map((classData, index) => (
                  // Colours and grid offset are computed in toWeekSchedule, so
                  // the display stays a pure function of its props.
                  <DayClass
                    key={`${day}-${classData.classTitle}-${index}`}
                    {...classData}
                  />
                ))}
              </div>
            </article>
          </div>
        ))}
      </section>

      <button
        className="absolute top-0 right-0 z-10 flex h-full w-8 items-center justify-between rounded-r-lg border-l-2 border-pink-900 bg-pink-50 py-4 text-center font-bold text-pink-900 transition-[right] [writing-mode:vertical-rl] 2xl:hidden [&:not([data-scroll-target])]:-right-8"
        data-scroll-target={next}
        onClick={scrollRight}
        type="button"
      >
        <CaretDoubleRightIcon weight="bold" />
        {next}
        <CaretDoubleRightIcon weight="bold" />
      </button>
    </div>
  );
}
