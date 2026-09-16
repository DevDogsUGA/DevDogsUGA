"use client";
import { type ClassData } from "~/types/scheduleTypes";
import { useState, useEffect } from "react";
import { SCHEDULE_SPAN_MINUTES } from "~/lib/schedule-display";

type DayClassProps = ClassData;

// A 12-hour time string to minutes since midnight.
function convertToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map((val) => parseInt(val, 10));
  const suffix = time.slice(-2).toLowerCase();
  let convertedTime = hour! * 60 + minute!; // The `!`s assume the string parsed; a NaN here means it did not.
  if (suffix === "pm" && hour !== 12) {
    convertedTime += 12 * 60;
  }
  if (suffix === "am" && hour === 12) {
    convertedTime -= 12 * 60;
  }
  return convertedTime;
}

// Length of the day's meeting, in minutes.
function getDuration(timeStart: string, timeEnd: string): number {
  const startMinutes = convertToMinutes(timeStart);
  const endMinutes = convertToMinutes(timeEnd);
  return endMinutes - startMinutes;
}

// Sizes the course info window relative to the viewport.
function useResize() {
  const [width, setWidth] = useState("80vw");
  const [height, setHeight] = useState("70vh");

  useEffect(() => {
    const handleResize = () => {
      setWidth(`${window.innerWidth * 0.8}px`);
      setHeight(`${window.innerHeight * 0.7}px`);
    };
    window.addEventListener("resize", handleResize);
  }, []);

  return { width, height };
}

// Builds the rows of the week schedule display table.
function getWeekLayout(
  otherTimes: string[],
  currentDay: string,
  timeStart: string,
  timeEnd: string,
  locationShort: string,
): string[] {
  // 14 slots: the time and the location for each of the seven days (Mon-Sun).
  // Day codes match DAY_CODE_MAP in ~/lib/schedule-display.ts: M/T/W/R/F for
  // the weekdays, S/U for Saturday/Sunday (U avoids colliding with Sunday's
  // "S" and Tuesday's/Thursday's letters).
  const weekInfo: string[] = [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  const otherDays: string = otherTimes[0] ?? "";

  // Add the current day's time and location to the table
  for (let i = 0; i <= currentDay.length; i++) {
    switch (currentDay[i]) {
      case "M":
        weekInfo[0] = timeStart + " - " + timeEnd;
        weekInfo[1] = locationShort;
        break;

      case "T":
        weekInfo[2] = timeStart + " - " + timeEnd;
        weekInfo[3] = locationShort;
        break;

      case "W":
        weekInfo[4] = timeStart + " - " + timeEnd;
        weekInfo[5] = locationShort;
        break;

      case "R":
        weekInfo[6] = timeStart + " - " + timeEnd;
        weekInfo[7] = locationShort;
        break;

      case "F":
        weekInfo[8] = timeStart + " - " + timeEnd;
        weekInfo[9] = locationShort;
        break;

      case "S":
        weekInfo[10] = timeStart + " - " + timeEnd;
        weekInfo[11] = locationShort;
        break;

      case "U":
        weekInfo[12] = timeStart + " - " + timeEnd;
        weekInfo[13] = locationShort;
        break;

      default:
        break;
    }
  }

  // Add the other days the class meets on, if any
  for (let i = 0; i <= otherDays.length; i++) {
    switch (otherDays[i]) {
      // Monday
      case "M":
        weekInfo[0] = otherTimes[1] ?? "";
        weekInfo[1] = otherTimes[2] ?? "";
        break;
      // Tuesday
      case "T":
        weekInfo[2] = otherTimes[1] ?? "";
        weekInfo[3] = otherTimes[2] ?? "";
        break;
      // Wednesday
      case "W":
        weekInfo[4] = otherTimes[1] ?? "";
        weekInfo[5] = otherTimes[2] ?? "";
        break;
      // Thursday
      case "R":
        weekInfo[6] = otherTimes[1] ?? "";
        weekInfo[7] = otherTimes[2] ?? "";
        break;
      // Friday
      case "F":
        weekInfo[8] = otherTimes[1] ?? "";
        weekInfo[9] = otherTimes[2] ?? "";
        break;
      // Saturday
      case "S":
        weekInfo[10] = otherTimes[1] ?? "";
        weekInfo[11] = otherTimes[2] ?? "";
        break;
      // Sunday
      case "U":
        weekInfo[12] = otherTimes[1] ?? "";
        weekInfo[13] = otherTimes[2] ?? "";
        break;
      default:
        break;
    }
  }
  return weekInfo;
}

function CourseInfo({
  classTitle,
  className,
  description,
  locationLong,
  locationShort,
  prereq,
  coreq,
  professor,
  semester,
  credits,
  crn,
  // Unused; uncomment to use.
  // openSeats,
  // maxSeats,
  // waitlist,
  bgColor,
  borderColor,
  timeStart,
  timeEnd,
  currentDay,
  otherTimes,
}: DayClassProps) {
  const outerBorder = `border-b-2 border-r-2 border-l-2 ${borderColor} rounded-3xl`;
  const innerBorder = `border-r-2 ${borderColor}`;
  const { width, height } = useResize();
  const weekInfo = getWeekLayout(
    otherTimes,
    currentDay,
    timeStart,
    timeEnd,
    locationShort,
  );

  const defaultPrereq = prereq && prereq.trim() !== "" ? prereq : "None";
  const defaultCorereq = coreq && coreq.trim() !== "" ? coreq : "None";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div
        className={`bg-surface relative flex flex-col rounded-lg ${outerBorder}`}
        style={{
          width,
          height,
          maxWidth: "90vw",
          maxHeight: "90vh",
        }}
      >
        <div className={`relative z-50 ${bgColor} rounded-lg p-8`}>
          <div className="text-right font-bold text-white/90">
            <p>CRN: {crn}</p>
          </div>
          <h2 className="text-3xl font-bold text-white">
            {classTitle}: {className}
          </h2>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className={`p-8 ${innerBorder} w-1/2 overflow-auto`}>
            <p>
              {" "}
              <b>Location:</b> {locationLong}{" "}
            </p>
            <p>
              {" "}
              <b>Professor:</b> {professor}{" "}
            </p>{" "}
            <br></br>
            <p>
              {" "}
              <b>Semester:</b> {semester}{" "}
            </p>
            <p>
              {" "}
              <b>Credit Hours:</b> {credits}{" "}
            </p>{" "}
            <br></br>
            <p>
              {" "}
              <b>Prerequisites:</b> {defaultPrereq}{" "}
            </p>
            <p>
              {" "}
              <b>Corequisites:</b> {defaultCorereq}{" "}
            </p>{" "}
            <br></br>
            <p> {description} </p>
          </div>

          <div className={`w-1/2 overflow-auto p-8`}>
            <p className="text-center text-2xl font-bold underline">
              {" "}
              Weekly Schedule:{" "}
            </p>
            <br></br>
            <div className="items-center overflow-x-auto">
              <table className="border-edge-strong w-full table-auto border">
                <thead>
                  <tr>
                    <th className="border-edge-strong border p-2 text-center underline">
                      Day
                    </th>
                    <th className="border-edge-strong border p-2 text-center underline">
                      Time
                    </th>
                    <th className="border-edge-strong border p-2 text-center underline">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-edge-strong border p-2 text-center font-bold">
                      Monday
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[0]}
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[1]}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-edge-strong border p-2 text-center font-bold">
                      Tuesday
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[2]}
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[3]}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-edge-strong border p-2 text-center font-bold">
                      Wednesday
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[4]}
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[5]}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-edge-strong border p-2 text-center font-bold">
                      Thursday
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[6]}
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[7]}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-edge-strong border p-2 text-center font-bold">
                      Friday
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[8]}
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[9]}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-edge-strong border p-2 text-center font-bold">
                      Saturday
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[10]}
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[11]}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-edge-strong border p-2 text-center font-bold">
                      Sunday
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[12]}
                    </td>
                    <td className="border-edge-strong border p-2 text-center">
                      {weekInfo[13]}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DayClass({
  classTitle,
  className,
  description,
  locationLong,
  locationShort,
  prereq,
  coreq,
  professor,
  semester,
  credits,
  crn,
  openSeats,
  maxSeats,
  waitlist,
  bgColor,
  borderColor,
  timeStart,
  timeEnd,
  timeDifference,
  currentDay,
  otherTimes,
}: DayClassProps) {
  // Blocks and hour lines share one coordinate space, percent of the 8 AM to
  // 10 PM span, so they stay aligned at any container height. Pixel offsets
  // could not, since the grid itself is sized in percentages.
  const duration = getDuration(timeStart, timeEnd);
  const startPosition = `${((timeDifference ?? 0) * 100) / SCHEDULE_SPAN_MINUTES}%`;
  const classHeight = `${(Number.isFinite(duration) ? Math.max(duration, 0) : 0) * (100 / SCHEDULE_SPAN_MINUTES)}%`;

  const [courseBlockClicked, setcourseBlockClicked] = useState(false);
  const courseBlockInfo = () => {
    setcourseBlockClicked(!courseBlockClicked);
  };

  timeStart = timeStart.toUpperCase();
  timeEnd = timeEnd.toUpperCase();

  return (
    // The wrapper spans the whole day column so the block's percentage offset
    // resolves against the hour grid. It ignores pointer events so stacked
    // wrappers do not swallow clicks meant for the block beneath them.
    <div
      className="pointer-events-none absolute inset-0"
      onClick={courseBlockInfo}
    >
      <div
        className={`pointer-events-auto absolute inset-x-0.5 rounded-lg p-2.5 transition duration-150 ease-in-out hover:bg-black ${bgColor} flex items-start justify-between gap-2 overflow-hidden`}
        style={{
          position: "absolute",
          top: startPosition,
          height: classHeight,
        }}
      >
        <div>
          <h2 className="font-bold text-white">{classTitle}</h2>
          {/* Uncomment following line to show location */}
          {/* {locationShort && (
            <p className="text-sm text-white/90">{locationShort}</p>
          )} */}
        </div>
        <div className="text-right text-xs text-white">
          <p>{timeStart}</p>
          <p>{timeEnd}</p>
        </div>
      </div>
      {courseBlockClicked && (
        <div className="pointer-events-auto">
          <CourseInfo
            classTitle={classTitle}
            className={className}
            description={description}
            locationLong={locationLong}
            locationShort={locationShort}
            prereq={prereq}
            coreq={coreq}
            professor={professor}
            semester={semester}
            credits={credits}
            crn={crn}
            openSeats={openSeats}
            maxSeats={maxSeats}
            waitlist={waitlist}
            bgColor={bgColor}
            borderColor={borderColor}
            timeStart={timeStart}
            timeEnd={timeEnd}
            timeDifference={timeDifference}
            currentDay={currentDay}
            otherTimes={otherTimes}
          />
        </div>
      )}
    </div>
  );
}
