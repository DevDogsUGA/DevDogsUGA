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
  const [payload, setPayload] = useState<DisplayPayload | null>(null);
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
      setPayload((await response.json()) as DisplayPayload);
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
      className="fullscreen:fixed fullscreen:inset-0 fullscreen:z-[100] fullscreen:rounded-none fullscreen:border-0 fullscreen:p-[clamp(1.5rem,4vw,4rem)] relative isolate overflow-hidden rounded-2xl border-2 border-cyan-400/50 bg-mauve-950 p-5 shadow-2xl shadow-cyan-950/40"
    >
      <div className="pointer-events-none absolute -top-1/2 -right-1/4 -z-10 size-[80%] rounded-full bg-cyan-500/20 blur-3xl" />
      <header className="flex items-start justify-between gap-4">
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
          className="fullscreen:hidden flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
        >
          <ArrowsOutIcon className="size-4" /> Full screen
        </button>
      </header>

      {error ? (
        <p
          className="mt-10 rounded-lg bg-rose-950/70 p-4 text-rose-200"
          role="alert"
        >
          {error}. The last displayed code may have expired.
        </p>
      ) : !payload || !qr ? (
        <p className="mt-10 text-mauve-300">Preparing attendance codes…</p>
      ) : (
        <div className="fullscreen:mt-[clamp(1.5rem,4vh,4rem)] fullscreen:grid-cols-[minmax(20rem,1fr)_minmax(24rem,0.9fr)] mt-6 grid items-center gap-8 md:grid-cols-[minmax(18rem,1fr)_minmax(18rem,0.8fr)]">
          <div
            aria-label="QR code for meeting attendance"
            className="mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-2xl bg-white p-3 [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <p className="text-sm font-semibold tracking-widest text-cyan-300 uppercase">
              Or enter this code
            </p>
            <p className="mt-3 font-mono text-[clamp(3rem,9vw,8rem)] leading-none font-black tracking-[0.12em] text-white tabular-nums">
              {payload.code.slice(0, 3)} {payload.code.slice(3)}
            </p>
            <div className="mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-cyan-400 transition-[width] duration-200"
                style={{ width: `${(remaining / 30) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-mauve-300">
              Rotates in {remaining} second{remaining === 1 ? "" : "s"}
            </p>
            <p className="mt-8 flex items-center gap-2 text-lg text-white">
              <CheckCircleIcon weight="fill" className="size-6 text-cyan-400" />
              {payload.attendanceCount} checked in
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
