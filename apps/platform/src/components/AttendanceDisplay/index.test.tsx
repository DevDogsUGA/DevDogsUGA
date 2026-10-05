import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AttendanceDisplay from "./index";
import type { TitleCardMeeting } from "./TitleCard";

const MEETING_ID = "aaaaaaaa-0000-4000-a000-000000000001";

const MEETING: TitleCardMeeting = {
  title: "Supabase",
  kind: "Build Session",
  building: "DLW",
  location: "124",
  startsAt: new Date("2026-09-28T22:00:00.000Z"),
  endsAt: new Date("2026-09-28T23:30:00.000Z"),
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AttendanceDisplay", () => {
  it("opens on the title card and requests no code until revealed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AttendanceDisplay
        meetingId={MEETING_ID}
        canceled={false}
        meeting={MEETING}
      />,
    );

    // The title card, not the code panel.
    expect(
      screen.getByRole("heading", { name: MEETING.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("WELCOME!")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests a code immediately after a reveal key press", async () => {
    const payload = {
      url: "https://devdogsuga.org/attendance/claim?code=222333",
      code: "222333",
      bucket: 1,
      expiresAt: Date.now() + 30_000,
      attendanceCount: 1,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AttendanceDisplay
        meetingId={MEETING_ID}
        canceled={false}
        meeting={MEETING}
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "ArrowRight" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/attendance/display/${MEETING_ID}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(screen.getByText("222", { exact: false })).toBeInTheDocument();
  });

  it("reveals on a click on the title card too", async () => {
    const payload = {
      url: "https://devdogsuga.org/attendance/claim?code=999999",
      code: "999999",
      bucket: 1,
      expiresAt: Date.now() + 30_000,
      attendanceCount: 0,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AttendanceDisplay
        meetingId={MEETING_ID}
        canceled={false}
        meeting={MEETING}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `Show the check-in code for ${MEETING.title}`,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the canceled meeting's confirm step before the title card", () => {
    render(
      <AttendanceDisplay meetingId={MEETING_ID} canceled meeting={MEETING} />,
    );

    expect(screen.getByText("This meeting is canceled")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: MEETING.title }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Show codes anyway"));

    expect(
      screen.getByRole("heading", { name: MEETING.title }),
    ).toBeInTheDocument();
  });
});
