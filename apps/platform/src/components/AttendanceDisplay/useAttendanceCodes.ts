"use client";

import { useCallback, useEffect, useState } from "react";

export interface AttendanceCodePayload {
  url: string;
  code: string;
  bucket: number;
  expiresAt: number;
  attendanceCount: number;
}

export interface UseAttendanceCodesOptions {
  meetingId: string;
  canceled: boolean;
  /**
   * Whether the hook should be fetching and reporting codes at all.
   *
   * This is the reveal gate: the display opens on a title card and the
   * 30-second code window is meant to start when an officer reveals the
   * code, not whenever the tab happened to load. While `enabled` is false
   * this hook makes no network requests and reports no payload, no matter
   * what it fetched before -- reversing the reveal (Left / Backspace /
   * PageUp on the title card) has to stop the polling loop as completely as
   * never having revealed at all.
   */
  enabled: boolean;
}

export interface UseAttendanceCodesResult {
  payload: AttendanceCodePayload | null;
  /**
   * Negative animation-delay that fast-forwards the 30s drain animation past
   * whatever part of the code window elapsed before the payload arrived.
   * Captured once per window: changing a running animation's delay shifts
   * its position, so refreshes within the same window must not touch it.
   */
  drainDelay: number;
  error: string | null;
  /** Wall clock, ticked every 250ms while enabled, for the "rotates in Ns" line. */
  now: number;
}

/**
 * Fetches and polls a meeting's rotating attendance code, gated on `enabled`.
 *
 * Split out of `AttendanceDisplay` so the one behaviour the task cares about
 * -- no request before the reveal, a request right after it -- is a plain
 * function of `enabled` rather than something only observable by rendering
 * the whole display, confirm step and title card included.
 */
export function useAttendanceCodes({
  meetingId,
  canceled,
  enabled,
}: UseAttendanceCodesOptions): UseAttendanceCodesResult {
  const [display, setDisplay] = useState<{
    payload: AttendanceCodePayload;
    drainDelay: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const suffix = canceled ? "?confirmCancelled=true" : "";
      const response = await fetch(
        `/attendance/display/${meetingId}${suffix}`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("Unable to refresh attendance codes");
      const payload = (await response.json()) as AttendanceCodePayload;
      const drainDelay = Math.min(0, payload.expiresAt - 30_000 - Date.now());
      setDisplay((previous) => ({
        payload,
        drainDelay:
          previous?.payload.expiresAt === payload.expiresAt
            ? previous.drainDelay
            : drainDelay,
      }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh");
    }
  }, [canceled, enabled, meetingId]);

  useEffect(() => {
    if (!enabled) return;
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const refreshTimer = window.setInterval(() => void refresh(), 5_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [enabled, refresh]);

  // Gated at the return rather than by clearing state inside the effect
  // above: a stale payload from the last reveal never flashes back on
  // screen before the disabled branch above has a chance to run, and
  // nothing here calls setState synchronously from an effect body.
  return {
    payload: enabled ? (display?.payload ?? null) : null,
    drainDelay: enabled ? (display?.drainDelay ?? 0) : 0,
    error: enabled ? error : null,
    now,
  };
}
