import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import DayClass from "./DayClass";
import type { ClassData } from "~/types/scheduleTypes";

/**
 * Test that DayClass renders without professor rating stars or review counts.
 * The RateMyProfessors widget has been removed, so CourseInfo should display
 * only the professor name in the "Professor:" line.
 */

// This config doesn't enable Vitest's `globals`, so RTL can't auto-detect a
// global `afterEach` to register its own cleanup. Without this, the modal
// left open by one test (courseBlockClicked state + its rendered CourseInfo)
// leaks into the next test's DOM, producing duplicate "CS 101" matches.
afterEach(() => cleanup());

const MINIMAL_CLASS_DATA: ClassData = {
  classTitle: "CS 101",
  className: "Intro to Computer Science",
  description: "An introduction to computer science fundamentals.",
  locationLong: "Computer Science Building, Room 101",
  locationShort: "CS 101",
  prereq: "None",
  coreq: "",
  professor: "Dr. Jane Smith",
  semester: "Spring 2024",
  credits: 3,
  crn: 12345,
  openSeats: 15,
  maxSeats: 30,
  waitlist: 0,
  bgColor: "bg-blue-500",
  borderColor: "border-blue-700",
  timeStart: "09:00 AM",
  timeEnd: "10:30 AM",
  timeDifference: 60,
  currentDay: "MWF",
  otherTimes: ["09:00 AM - 10:30 AM", "09:00 AM", "10:30 AM"],
};

describe("DayClass", () => {
  it("renders Saturday and Sunday rows in the weekly schedule table", async () => {
    const weekendClassData: ClassData = {
      ...MINIMAL_CLASS_DATA,
      currentDay: "SU",
    };
    render(<DayClass {...weekendClassData} />);

    const courseBlock = screen.getByText("CS 101");
    await userEvent.click(courseBlock);

    const saturdayRow = screen.getByText("Saturday").closest("tr");
    const sundayRow = screen.getByText("Sunday").closest("tr");
    expect(saturdayRow).not.toBeNull();
    expect(sundayRow).not.toBeNull();

    // Both days should carry the meeting's time/location, not blank cells,
    // proving getWeekLayout actually maps the S/U day codes rather than
    // silently falling through its switch's `default` case.
    expect(saturdayRow).toHaveTextContent("09:00 AM - 10:30 AM");
    expect(saturdayRow).toHaveTextContent("CS 101");
    expect(sundayRow).toHaveTextContent("09:00 AM - 10:30 AM");
    expect(sundayRow).toHaveTextContent("CS 101");
  });

  it("renders professor name without stars or review count", async () => {
    render(<DayClass {...MINIMAL_CLASS_DATA} />);

    // Click the course block to open CourseInfo modal
    const courseBlock = screen.getByText("CS 101");
    await userEvent.click(courseBlock);

    // Assert professor name is shown
    expect(screen.getByText(/Dr. Jane Smith/)).toBeInTheDocument();

    // Assert no star icons are rendered
    const starIcons = screen.queryAllByRole("img", { hidden: true });
    // Filter for star icons (they won't exist if the ProfessorStars component is removed)
    const starIconsInProfessorLine = starIcons.filter(
      (icon) =>
        icon.closest("p")?.textContent?.includes("Professor") &&
        icon.className?.includes("star"),
    );
    expect(starIconsInProfessorLine).toHaveLength(0);

    // Assert no review count text is rendered
    expect(screen.queryByText(/reviews$/)).not.toBeInTheDocument();
  });
});
