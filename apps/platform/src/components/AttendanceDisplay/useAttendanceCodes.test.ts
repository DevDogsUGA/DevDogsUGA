import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAttendanceCodes } from "./useAttendanceCodes";

const MEETING_ID = "aaaaaaaa-0000-4000-a000-000000000001";

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

describe("useAttendanceCodes", () => {
  it("makes no request before the reveal", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useAttendanceCodes({
        meetingId: MEETING_ID,
        canceled: false,
        enabled: false,
      }),
    );

    // The hook's own initial fetch is scheduled with a `setTimeout(..., 0)`,
    // so give fake timers a chance to run it if it were (wrongly) armed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests a code right after the reveal, and reports it", async () => {
    const payload = {
      url: "https://devdogsuga.org/attendance/claim?code=123456",
      code: "123456",
      bucket: 1,
      expiresAt: Date.now() + 30_000,
      attendanceCount: 3,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAttendanceCodes({
          meetingId: MEETING_ID,
          canceled: false,
          enabled,
        }),
      { initialProps: { enabled: false } },
    );

    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });

    // The initial fetch is scheduled with a `setTimeout(..., 0)`; flushing
    // it also drains the `fetch`/`.json()` microtask chain that follows.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/attendance/display/${MEETING_ID}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result.current.payload?.code).toBe(payload.code);
  });

  it("stops reporting a payload once the reveal is reversed", async () => {
    const payload = {
      url: "https://devdogsuga.org/attendance/claim?code=654321",
      code: "654321",
      bucket: 1,
      expiresAt: Date.now() + 30_000,
      attendanceCount: 0,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAttendanceCodes({
          meetingId: MEETING_ID,
          canceled: false,
          enabled,
        }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.payload?.code).toBe(payload.code);

    rerender({ enabled: false });

    expect(result.current.payload).toBeNull();

    const callsAtReversal = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAtReversal);
  });
});
