"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowsOutIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { QR_DEFAULTS, renderQrSvg } from "@devdogsuga/brand/qr";
import TitleCard, { titleCardWash, type TitleCardMeeting } from "./TitleCard";
import { useAttendanceCodes } from "./useAttendanceCodes";

/** Advances from the title card to the code, presenter-remote-friendly. */
const ADVANCE_KEYS = new Set([
  " ",
  "Spacebar",
  "ArrowRight",
  "Enter",
  "PageDown",
]);
/** Reverses from the code back to the title card. */
const BACK_KEYS = new Set(["ArrowLeft", "Backspace", "PageUp"]);

export default function AttendanceDisplay({
  meetingId,
  canceled,
  meeting,
  present = false,
}: {
  meetingId: string;
  canceled: boolean;
  /** Everything the opening title card needs -- see `TitleCard`'s doc. */
  meeting: TitleCardMeeting;
  /**
   * Renders edge-to-edge at the viewport instead of as a bordered card
   * inside the console page -- for the `(present)` route a popup opened via
   * `OpenDisplayLink` lands on, which has no site chrome around it to be a
   * card inside of. The slide itself looks the same either way: it scales
   * with its box.
   */
  present?: boolean;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const [confirmed, setConfirmed] = useState(!canceled);
  // The display opens on the title card, not the code: revealing it is a
  // deliberate act (a key press or a click), and the 30-second code window
  // has to start there, not at page load. See `useAttendanceCodes`.
  const [revealed, setRevealed] = useState(false);

  const advance = useCallback(() => setRevealed(true), []);
  const back = useCallback(() => setRevealed(false), []);

  // Presenter-remote-friendly: a remote sends key events to the page
  // regardless of what has focus, so this listens on the window rather than
  // requiring the title card itself to be focused.
  useEffect(() => {
    if (!confirmed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (ADVANCE_KEYS.has(event.key)) {
        event.preventDefault();
        advance();
      } else if (BACK_KEYS.has(event.key)) {
        event.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmed, advance, back]);

  const { payload, drainDelay, error, now } = useAttendanceCodes({
    meetingId,
    canceled,
    enabled: confirmed && revealed,
  });

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

  // The template's own QR: `QR_DEFAULTS` is white modules straight on the
  // slide background with the DevDogs mark in the middle, which is what the
  // reference deck's pasted code was exported with.
  const qr = useMemo(
    () =>
      payload
        ? renderQrSvg(payload.url, QR_DEFAULTS, "/brand/devdog.svg")
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
      // `h-[36rem]`/`h-dvh`, never `min-h`: the slide sizes itself in
      // container query units off the region below, and a size container
      // needs a *specified* height to measure. A `min-height` doesn't count
      // as one -- the region, and the slide in it, would collapse to 0.
      className={
        present
          ? "relative isolate flex h-dvh w-full flex-col overflow-hidden bg-mauve-950"
          : "fullscreen:rounded-none fullscreen:border-0 fullscreen:h-screen relative isolate flex h-[36rem] flex-col overflow-hidden rounded-2xl border-2 border-cyan-400/50 bg-mauve-950 shadow-2xl shadow-cyan-950/40"
      }
    >
      {/* `container-type: size` so the slide can letterbox itself to 16:9
          inside whatever is left once the button row below takes its
          height; the wash stays full-bleed out here. A flex sibling (not an
          overlay) reserves the "Full screen" button's own row, so the
          button can never sit on top of the slide's content. */}
      <div
        className="[container-type:size] relative min-h-0 flex-1"
        style={{ backgroundImage: titleCardWash(meeting.kind) }}
      >
        <TitleCard
          meeting={meeting}
          onReveal={advance}
          qr={
            !revealed ? (
              <p className="flex size-full items-center justify-center rounded-[4%] border-[0.15cqw] border-dashed border-white/15 p-[8%] text-center text-[1.1cqw] text-mauve-400">
                <span className="text-balance">
                  Space / → / Enter to show the{" "}
                  <span className="whitespace-nowrap">check-in</span> code
                </span>
              </p>
            ) : error ? (
              <p
                className="flex size-full items-center justify-center p-[8%] text-center text-[1.1cqw] text-rose-300"
                role="alert"
              >
                {error}. The last displayed code may have expired.
              </p>
            ) : !payload || !qr ? (
              <p className="flex size-full items-center justify-center text-center text-[1.1cqw] text-mauve-400">
                Preparing attendance codes…
              </p>
            ) : (
              <div
                aria-label="QR code for meeting attendance"
                className="animate-in fade-in size-full duration-500 [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            )
          }
          code={
            revealed && payload && !error ? (
              <>
                <p className="font-mono text-[2.6cqw] leading-none font-bold tracking-[0.12em] text-white tabular-nums">
                  {payload.code.slice(0, 3)} {payload.code.slice(3)}
                </p>
                <div className="mt-[1.2cqw] h-[0.3cqw] w-3/5 overflow-hidden rounded-full bg-white/10">
                  <div
                    key={payload.expiresAt}
                    className="h-full origin-left bg-cyan-400"
                    style={{
                      animation: "attendance-drain 30s linear forwards",
                      animationDelay: `${drainDelay}ms`,
                    }}
                  />
                </div>
              </>
            ) : null
          }
          status={
            revealed && payload && !error ? (
              <>
                <p className="text-[1.064cqw] leading-none font-bold text-white tabular-nums">
                  {payload.attendanceCount} checked in
                </p>
                <p className="text-[0.917cqw] leading-none text-[#d7d0d7] tabular-nums">
                  New code in {remaining} second{remaining === 1 ? "" : "s"}
                </p>
              </>
            ) : null
          }
        />
      </div>

      {/* A real, laid-out row rather than an overlay, so it can never sit on
          top of the title card's or the code panel's content in either
          state -- both panels above get exactly this row's height less to
          work with instead. Hidden (and its height reclaimed) only once the
          Fullscreen API is truly active: present mode alone still needs the
          control, since a popup isn't `:fullscreen` until this is clicked. */}
      <div className="fullscreen:hidden flex shrink-0 items-center px-4 py-3">
        <button
          type="button"
          onClick={() => void screen.current?.requestFullscreen()}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
        >
          <ArrowsOutIcon className="size-4" /> Full screen
        </button>
      </div>
    </div>
  );
}
