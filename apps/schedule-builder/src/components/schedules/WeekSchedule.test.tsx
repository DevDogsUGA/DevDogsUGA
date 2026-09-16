import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WeekSchedule from "./WeekSchedule";
import type { WeekSchedule as WeekScheduleType } from "~/types/scheduleTypes";

/**
 * toWeekSchedule() now emits Saturday/Sunday keys alongside the weekdays, but
 * the grid used to hardcode exactly 5 day-columns (`repeat(5, ...)` plus
 * `--cols` breakpoints capped at 5). That hardcoding didn't drop any DOM
 * columns (the component already maps over Object.entries(weekData)), but it
 * did mean the CSS grid template never reserved tracks for a 6th/7th day, so
 * this asserts the grid sizing itself tracks the day count instead of a
 * literal 5.
 */

afterEach(() => cleanup());

const FIVE_DAY_WEEK: WeekScheduleType = {
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
};

const SEVEN_DAY_WEEK: WeekScheduleType = {
  ...FIVE_DAY_WEEK,
  Saturday: [],
  Sunday: [],
};

describe("WeekSchedule", () => {
  it("renders one day-column per key present in weekData, including weekends", () => {
    render(<WeekSchedule weekData={SEVEN_DAY_WEEK} />);

    for (const day of Object.keys(SEVEN_DAY_WEEK)) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }

    expect(document.querySelectorAll("[data-title]")).toHaveLength(7);
  });

  it("sizes the grid template to the day count instead of a hardcoded 5 columns", () => {
    const { container: fiveDayContainer } = render(
      <WeekSchedule weekData={FIVE_DAY_WEEK} />,
    );
    const fiveDayGrid = fiveDayContainer.querySelector("section")!;
    expect(fiveDayGrid.className).toContain("repeat(5,");
    expect(fiveDayGrid.className).toContain("2xl:[--cols:5]");
    cleanup();

    const { container: sevenDayContainer } = render(
      <WeekSchedule weekData={SEVEN_DAY_WEEK} />,
    );
    const sevenDayGrid = sevenDayContainer.querySelector("section")!;
    expect(sevenDayGrid.className).toContain("repeat(7,");
    expect(sevenDayGrid.className).toContain("2xl:[--cols:7]");
    // Weekend-containing weeks shouldn't still be capped at the old literal 5.
    expect(sevenDayGrid.className).not.toContain("2xl:[--cols:5]");
  });
});
