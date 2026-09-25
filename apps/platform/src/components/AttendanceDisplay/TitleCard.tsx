import Image from "next/image";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { formatEventSpan } from "~/lib/eventTime";
import type { AccentColor } from "~/ui/accent-blobs";
import { meetingAccent, meetingChip } from "./meetingAccent";

const WASH_CLASS: Record<AccentColor, string> = {
  amber: "bg-amber-500/25",
  blue: "bg-blue-500/25",
  cyan: "bg-cyan-400/25",
  emerald: "bg-emerald-500/25",
  rose: "bg-rose-500/25",
  violet: "bg-violet-500/25",
};

const CHIP_CLASS: Record<AccentColor, string> = {
  amber: "bg-amber-500 text-black",
  blue: "bg-blue-500 text-white",
  cyan: "bg-cyan-400 text-black",
  emerald: "bg-emerald-500 text-black",
  rose: "bg-rose-500 text-white",
  violet: "bg-violet-500 text-white",
};

/**
 * Everything the title card is allowed to draw from -- the `meetings` row a
 * `@devdogsuga/events` config entry becomes once synced, nothing hand-typed
 * per meeting. See `meetingAccent.ts` for the chip/wash derivation and
 * `getOfficerAttendanceMeeting` for where these fields are selected.
 */
export interface TitleCardMeeting {
  title: string;
  kind: string | null;
  summary: string | null;
  building: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
}

/**
 * The opening slide of an attendance display: an event title card in the
 * style of a meeting's opening deck slide (see `apps/slides`'s `title`
 * layout and `LAYOUTS.md`'s chrome section), so this display can stand in
 * for the first slide of a presentation instead of a bespoke QR slide.
 *
 * Deliberately dumb: it draws only from the fields on {@link TitleCardMeeting},
 * so it never drifts from the meeting an officer actually scheduled and
 * nobody has to author a slide for it.
 */
export default function TitleCard({
  meeting,
  onReveal,
}: {
  meeting: TitleCardMeeting;
  onReveal: () => void;
}) {
  const accent = meetingAccent(meeting.kind);
  const chip = meetingChip(meeting.kind);
  const where = locationLine(meeting.building, meeting.location);
  const when = formatEventSpan(meeting.startsAt, meeting.endsAt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onReveal}
      aria-label={`Show the check-in code for ${meeting.title}`}
      className="relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl p-[clamp(1.5rem,5vw,5rem)] text-left outline-none"
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-1/3 -right-1/4 size-[70%] rounded-full blur-3xl ${WASH_CLASS[accent]}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -bottom-1/3 -left-1/4 size-[55%] rounded-full blur-3xl ${WASH_CLASS[accent]}`}
      />

      <span
        className={`fullscreen:top-[clamp(1.25rem,3vw,2.5rem)] fullscreen:right-[clamp(1.25rem,3vw,2.5rem)] absolute top-4 right-4 inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold tracking-widest uppercase ${CHIP_CLASS[accent]}`}
      >
        {chip}
      </span>

      {/* Top row (mark) and bottom row (GDG footer) sit in normal flow, so
          only the middle region has to share space with the reveal hint --
          `justify-center` on the whole column plus `mt-auto` on the footer
          fight each other and can push the heading off the top of a short
          panel. */}
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        {/* A string `src` into `public/brand`, matching `QrGenerator`'s
            `devdog.svg` usage, rather than a static import: this file
            renders wherever `AttendanceDisplay` does, including plain
            Vitest/jsdom, and a static SVG import only carries width/height
            metadata under Next's own bundler. */}
        <Image
          src="/brand/devdog.svg"
          alt=""
          width={24}
          height={24}
          unoptimized
          className="size-6"
        />
        DevDogs
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <h1 className="font-display text-[clamp(2.25rem,6.5vw,5.5rem)] leading-[1.05] font-bold text-white">
          {meeting.title}
        </h1>

        {meeting.summary && (
          <p className="mt-4 max-w-3xl text-[clamp(1rem,2vw,1.4rem)] text-mauve-400">
            {meeting.summary}
          </p>
        )}

        <p className="mt-6 text-[clamp(0.95rem,1.6vw,1.25rem)] font-medium text-mauve-300">
          {when}
          {where ? ` · ${where}` : ""}
        </p>

        <p className="mt-10 text-sm text-mauve-500">
          Space / → / Enter to show the check-in code
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Image
          src="/brand/gdgc-uga-lockup-dark.svg"
          alt="Google Developer Groups on Campus · University of Georgia"
          width={168}
          height={22}
          unoptimized
          className="h-5 w-auto opacity-90 sm:h-6"
        />
      </div>
    </div>
  );
}
