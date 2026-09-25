"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsOutIcon,
  CheckCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react/ssr";
import { QR_DEFAULTS, renderQrSvg } from "~/lib/qr";
import TitleCard, { type TitleCardMeeting } from "./TitleCard";
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
  title,
  canceled,
  meeting,
  present = false,
}: {
  meetingId: string;
  title: string;
  canceled: boolean;
  /** Everything the opening title card needs -- see `TitleCard`'s doc. */
  meeting: TitleCardMeeting;
  /**
   * Renders edge-to-edge at the viewport instead of as a bordered card
   * inside the console page -- for the `(present)` route a popup opened via
   * `OpenDisplayLink` lands on, which has no site chrome around it to be a
   * card inside of. Also tags the root with `data-present-mode`, which the
   * `big:` Tailwind variant (see globals.css) matches the same way it
   * matches real `:fullscreen`, so the projector-scaled type and layout an
   * officer would otherwise only get after clicking "Full screen" apply
   * immediately.
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
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
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
      data-present-mode={present || undefined}
      // `h-[36rem]`/`h-dvh`, never `min-h`: the title card and code panel
      // are stacked with `absolute inset-0` so they can cross-fade in
      // place, and an absolutely positioned box with `inset-0` sizes itself
      // from its containing block's own *specified* height. A `min-height`
      // doesn't count as one -- Chrome renders that containing block, and
      // every `inset-0` descendant of it, at 0 height, min-height or not.
      className={
        present
          ? "relative isolate flex h-dvh w-full flex-col overflow-hidden bg-mauve-950"
          : "fullscreen:rounded-none fullscreen:border-0 relative isolate flex h-[36rem] flex-col overflow-hidden rounded-2xl border-2 border-cyan-400/50 bg-mauve-950 shadow-2xl shadow-cyan-950/40 fullscreen:h-screen"
      }
    >
      {/* Both panels are absolutely stacked over the same box, so switching
          between them reads as a slide advance (a CSS transition of the
          panel already on screen) rather than a page load or remount. A
          flex sibling (not an overlay) reserves the "Full screen" button's
          own row below this, so the button can never sit on top of either
          panel's content -- see the row at the bottom of this component. */}
      <div className="relative min-h-0 flex-1">
        <div
          aria-hidden={revealed}
          className={`absolute inset-0 transition-all duration-500 ease-in-out ${
            revealed
              ? "pointer-events-none -translate-x-6 opacity-0"
              : "translate-x-0 opacity-100"
          }`}
        >
          <TitleCard meeting={meeting} onReveal={advance} />
        </div>

        <div
          aria-hidden={!revealed}
          className={`big:p-[clamp(1.5rem,4vw,4rem)] absolute inset-0 flex flex-col justify-center p-5 transition-all duration-500 ease-in-out ${
            revealed
              ? "translate-x-0 opacity-100"
              : "pointer-events-none translate-x-6 opacity-0"
          }`}
        >
          <div className="pointer-events-none absolute -top-1/2 -right-1/4 -z-10 size-[80%] rounded-full bg-cyan-500/20 blur-3xl" />
          <header className="big:justify-center big:text-center flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-sm font-bold tracking-[0.2em] text-cyan-300 uppercase">
                DevDogs attendance
              </p>
              <h2 className="font-display big:text-[clamp(2rem,5vw,5rem)] mt-2 text-2xl font-semibold text-white sm:text-4xl">
                {title}
              </h2>
            </div>
          </header>

          {error ? (
            <p
              className="big:text-center mt-10 rounded-lg bg-rose-950/70 p-4 text-rose-200"
              role="alert"
            >
              {error}. The last displayed code may have expired.
            </p>
          ) : !payload || !qr ? (
            <p className="big:text-center mt-10 text-mauve-300">
              Preparing attendance codes…
            </p>
          ) : (
            <div className="big:mt-[clamp(1.5rem,4vh,4rem)] big:w-full big:max-w-[100rem] big:grid-cols-[minmax(20rem,1fr)_minmax(24rem,0.9fr)] big:gap-[clamp(2rem,5vw,6rem)] big:self-center mt-6 grid items-center gap-8 md:grid-cols-[minmax(18rem,1fr)_minmax(18rem,0.8fr)]">
              <div
                aria-label="QR code for meeting attendance"
                className="big:max-w-[min(62vh,50rem)] big:max-h-none big:p-4 mx-auto aspect-square w-full max-w-xl max-h-[24rem] overflow-hidden rounded-2xl bg-white p-3 [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <div className="flex flex-col items-center text-center md:items-start md:text-left">
                <p className="text-sm font-semibold tracking-widest text-cyan-300 uppercase">
                  Or enter this code
                </p>
                <p className="mt-3 font-mono text-[clamp(3rem,9vw,8rem)] leading-none font-black tracking-[0.12em] text-white tabular-nums">
                  {payload.code.slice(0, 3)} {payload.code.slice(3)}
                </p>
                <div className="big:mt-8 big:h-3 big:max-w-xl mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10">
                  <div
                    key={payload.expiresAt}
                    className="h-full origin-left bg-cyan-400"
                    style={{
                      animation: "attendance-drain 30s linear forwards",
                      animationDelay: `${drainDelay}ms`,
                    }}
                  />
                </div>
                <p className="big:text-lg mt-2 text-sm text-mauve-300 tabular-nums">
                  Rotates in {remaining} second{remaining === 1 ? "" : "s"}
                </p>
                <p className="big:text-2xl big:mt-10 mt-8 flex items-center gap-2 text-lg text-white">
                  <CheckCircleIcon
                    weight="fill"
                    className="big:size-8 size-6 text-cyan-400"
                  />
                  {payload.attendanceCount} checked in
                </p>
              </div>
            </div>
          )}
        </div>
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
