"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsOutIcon,
  CheckCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react/ssr";
import { QR_DEFAULTS, renderQrSvg } from "~/lib/qr";

type DisplayPayload = {
  url: string;
  code: string;
  bucket: number;
  expiresAt: number;
  attendanceCount: number;
};

export default function AttendanceDisplay({
  meetingId,
  title,
  canceled,
}: {
  meetingId: string;
  title: string;
  canceled: boolean;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const [confirmed, setConfirmed] = useState(!canceled);
  const [display, setDisplay] = useState<{
    payload: DisplayPayload;
    /* Negative animation-delay that fast-forwards the 30s drain animation past
       whatever part of the code window elapsed before the payload arrived.
       Captured once per window: changing a running animation's delay shifts
       its position, so refreshes within the same window must not touch it. */
    drainDelay: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!confirmed) return;
    try {
      const suffix = canceled ? "?confirmCancelled=true" : "";
      const response = await fetch(
        `/attendance/display/${meetingId}${suffix}`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("Unable to refresh attendance codes");
      const payload = (await response.json()) as DisplayPayload;
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
  }, [canceled, confirmed, meetingId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const refreshTimer = window.setInterval(() => void refresh(), 5_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [refresh]);

  // This screen gets projected and left unattended, so keep the display from
  // sleeping while it's open. The lock is released whenever the tab is hidden,
  // hence the re-request on visibilitychange.
  useEffect(() => {
    if (!confirmed || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    const acquire = () => {
      void navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (disposed) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [confirmed]);

  const payload = display?.payload ?? null;
  const drainDelay = display?.drainDelay ?? 0;
  const qr = useMemo(
    () =>
      payload
        ? renderQrSvg(payload.url, {
            ...QR_DEFAULTS,
            size: 900,
            margin: 3,
            color: "#09090b",
            background: "#ffffff",
            logoSize: 1,
            errorLevel: "M",
            shape: "rounded",
          })
        : null,
    [payload],
  );
  const remaining = payload
    ? Math.max(0, Math.ceil((payload.expiresAt - now) / 1_000))
    : 0;
  if (!confirmed) {
    return (
      <section className="rounded-xl border-2 border-amber-400 bg-amber-950/50 p-6">
        <div className="flex gap-4">
          <WarningIcon className="mt-0.5 size-7 shrink-0 text-amber-300" />
          <div>
            <h2 className="text-lg font-semibold text-white">
              This meeting is canceled
            </h2>
            <p className="mt-1 max-w-prose text-sm text-amber-100/80">
              Its codes cannot record attendance unless an officer deliberately
              opens this display. Member check-in will still reject the canceled
              meeting.
            </p>
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="mt-5 rounded-sm border-2 border-amber-300 bg-amber-300 px-4 py-2 font-medium text-black"
            >
              Show codes anyway
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div
      ref={screen}
      className="fullscreen:flex fullscreen:flex-col fullscreen:justify-center fullscreen:rounded-none fullscreen:border-0 fullscreen:p-[clamp(1.5rem,4vw,4rem)] relative isolate overflow-hidden rounded-2xl border-2 border-cyan-400/50 bg-mauve-950 p-5 shadow-2xl shadow-cyan-950/40"
    >
      <div className="pointer-events-none absolute -top-1/2 -right-1/4 -z-10 size-[80%] rounded-full bg-cyan-500/20 blur-3xl" />
      <header className="fullscreen:justify-center fullscreen:text-center flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-sm font-bold tracking-[0.2em] text-cyan-300 uppercase">
            DevDogs attendance
          </p>
          <h2 className="font-display fullscreen:text-[clamp(2rem,5vw,5rem)] mt-2 text-2xl font-semibold text-white sm:text-4xl">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void screen.current?.requestFullscreen()}
          className="fullscreen:hidden flex cursor-pointer items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
        >
          <ArrowsOutIcon className="size-4" /> Full screen
        </button>
      </header>

      {error ? (
        <p
          className="fullscreen:text-center mt-10 rounded-lg bg-rose-950/70 p-4 text-rose-200"
          role="alert"
        >
          {error}. The last displayed code may have expired.
        </p>
      ) : !payload || !qr ? (
        <p className="fullscreen:text-center mt-10 text-mauve-300">
          Preparing attendance codes…
        </p>
      ) : (
        <div className="fullscreen:mt-[clamp(1.5rem,4vh,4rem)] fullscreen:w-full fullscreen:max-w-[100rem] fullscreen:grid-cols-[minmax(20rem,1fr)_minmax(24rem,0.9fr)] fullscreen:gap-[clamp(2rem,5vw,6rem)] fullscreen:self-center mt-6 grid items-center gap-8 md:grid-cols-[minmax(18rem,1fr)_minmax(18rem,0.8fr)]">
          <div
            aria-label="QR code for meeting attendance"
            className="fullscreen:max-w-[min(62vh,50rem)] fullscreen:p-4 mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-2xl bg-white p-3 [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <p className="text-sm font-semibold tracking-widest text-cyan-300 uppercase">
              Or enter this code
            </p>
            <p className="mt-3 font-mono text-[clamp(3rem,9vw,8rem)] leading-none font-black tracking-[0.12em] text-white tabular-nums">
              {payload.code.slice(0, 3)} {payload.code.slice(3)}
            </p>
            <div className="fullscreen:mt-8 fullscreen:h-3 fullscreen:max-w-xl mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10">
              <div
                key={payload.expiresAt}
                className="h-full origin-left bg-cyan-400"
                style={{
                  animation: "attendance-drain 30s linear forwards",
                  animationDelay: `${drainDelay}ms`,
                }}
              />
            </div>
            <p className="fullscreen:text-lg mt-2 text-sm text-mauve-300 tabular-nums">
              Rotates in {remaining} second{remaining === 1 ? "" : "s"}
            </p>
            <p className="fullscreen:text-2xl fullscreen:mt-10 mt-8 flex items-center gap-2 text-lg text-white">
              <CheckCircleIcon
                weight="fill"
                className="fullscreen:size-8 size-6 text-cyan-400"
              />
              {payload.attendanceCount} checked in
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
