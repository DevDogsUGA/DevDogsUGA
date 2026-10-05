import type { ReactNode } from "react";
import Image from "next/image";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { formatEventLongDate, formatEventTime } from "~/lib/eventTime";
import type { AccentColor } from "~/ui/accent-blobs";
import { meetingAccent } from "./meetingAccent";

/**
 * The corner wash the deck's `DD_*` layouts bake into their background
 * image: the accent's 500 at roughly 17%, centred just inside the top-right
 * corner and gone by the middle of the slide. Literal colors rather than
 * `var(--color-*)`, which Tailwind only emits for colors a class uses.
 */
const WASH_RGB: Record<AccentColor, string> = {
  amber: "245 158 11",
  blue: "59 130 246",
  cyan: "6 182 212",
  emerald: "16 185 129",
  rose: "244 63 94",
  violet: "139 92 246",
};

const CHIP_CLASS: Record<AccentColor, string> = {
  amber: "bg-amber-400",
  blue: "bg-blue-400",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400",
};

const DATE_CLASS: Record<AccentColor, string> = {
  amber: "text-amber-400",
  blue: "text-blue-400",
  cyan: "text-cyan-400",
  emerald: "text-emerald-400",
  rose: "text-rose-400",
  violet: "text-violet-400",
};

/** The full-bleed background behind the slide: the accent's corner wash. */
export function titleCardWash(kind: string | null): string {
  const rgb = WASH_RGB[meetingAccent(kind)];
  return `radial-gradient(ellipse 60% 90% at 87% 5%, rgb(${rgb} / 0.17), rgb(${rgb} / 0.06) 45%, transparent 90%)`;
}

/**
 * Everything the title card is allowed to draw from -- the `meetings` row a
 * `@devdogsuga/events` config entry becomes once synced, nothing hand-typed
 * per meeting. See `meetingAccent.ts` for the accent derivation and
 * `getOfficerAttendanceMeeting` for where these fields are selected.
 */
export interface TitleCardMeeting {
  title: string;
  kind: string | null;
  building: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Builds a {@link TitleCardMeeting} from a `getOfficerAttendanceMeeting` row
 * plus its already-computed display title -- the one mapping shared by the
 * boxed officer page and the full-viewport `(present)` route, so the two
 * can't drift on which fields the card is allowed to draw from.
 */
export function toTitleCardMeeting(
  meeting: {
    kind: string | null;
    building: string | null;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
  },
  title: string,
): TitleCardMeeting {
  return {
    title,
    kind: meeting.kind,
    building: meeting.building,
    location: meeting.location,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
  };
}

/**
 * The attendance display as a meeting's opening deck slide: the `TITLE`
 * slide of the Google Slides template (`Dev Session #3.pptx` is the
 * reference), with the live code where that slide's pasted QR sits, so this
 * can stand in for the first slide of a presentation.
 *
 * A fixed 16:9 stage letterboxed into whatever box it gets, with every piece
 * at the slide's own coordinates (percent of the 13.33in x 7.5in page) and
 * every font size in `cqw` (the slide's point size / 960pt), so it lays out
 * the same in the console card and on a projector.
 *
 * Deliberately dumb: the text draws only from {@link TitleCardMeeting}, so it
 * never drifts from the meeting an officer actually scheduled; the code
 * itself arrives through the `qr`, `code` and `status` slots.
 */
export default function TitleCard({
  meeting,
  onReveal,
  qr,
  code,
  status,
}: {
  meeting: TitleCardMeeting;
  onReveal: () => void;
  /** The square under the slide's QR position. */
  qr: ReactNode;
  /** Under the `ATTENDANCE` label: the typed code and its countdown. */
  code: ReactNode;
  /**
   * Under the code column, in the same band as the GDG footer's mark -- so
   * it should fill that height, centred on the column.
   */
  status: ReactNode;
}) {
  const accent = meetingAccent(meeting.kind);
  const where = locationLine(meeting.building, meeting.location);
  const when = [
    formatEventLongDate(meeting.startsAt),
    formatEventTime(meeting.startsAt),
    where,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onReveal}
      aria-label={`Show the check-in code for ${meeting.title}`}
      className="[container-type:size] absolute inset-0 m-auto h-[min(100cqh,calc(100cqw*9/16))] w-[min(100cqw,calc(100cqh*16/9))] cursor-pointer text-left outline-none"
    >
      {/* A string `src` into `public/brand`, matching `QrGenerator`'s
          `devdog.svg` usage, rather than a static import: this file renders
          wherever `AttendanceDisplay` does, including plain Vitest/jsdom,
          and a static SVG import only carries width/height metadata under
          Next's own bundler. */}
      <Image
        src="/brand/devdog.svg"
        alt=""
        width={1144}
        height={1228}
        unoptimized
        className="absolute top-[5.33%] left-[3%] h-[4.15%] w-auto"
      />
      <span className="font-display absolute top-[5.8%] left-[6.02%] text-[1.95cqw] leading-none font-bold text-white">
        DevDogs
      </span>

      <span
        className={`absolute top-[4.74%] left-[82.75%] flex h-[5.33%] w-[14.25%] items-center justify-center rounded-full text-[1.5cqw] font-bold text-black ${CHIP_CLASS[accent]}`}
      >
        WELCOME!
      </span>

      {/* Bottom-anchored where the slide's title box ends, so a title that
          wraps grows upward into the space the template's empty first
          paragraph reserves for a second line. */}
      <h1 className="font-display absolute bottom-[44.7%] left-[5.33%] line-clamp-2 w-[64%] text-[7.5cqw] leading-[1.05] font-bold text-white">
        {meeting.title}
      </h1>

      <p
        className={`absolute top-[calc(79.25%-3.275cqw)] left-[5.33%] w-[64%] text-[2cqw] leading-none font-bold ${DATE_CLASS[accent]}`}
      >
        {when}
      </p>

      <div className="absolute top-[27.05%] left-[73.02%] aspect-square w-[22.93%]">
        {qr}
      </div>
      {/* Centred between the QR's bottom (67.81%) and the check-in count's
          top (90.7%): 79.25%, less half the group's 6.55cqw height. The code
          slot keeps its height before the reveal so the label never moves,
          and the date line on the left shares the label's top. */}
      <div className="absolute top-[calc(79.25%-3.275cqw)] left-[73.02%] flex w-[22.93%] flex-col items-center gap-[1.2cqw]">
        <p className="font-mono text-[1.25cqw] leading-none text-cyan-400">
          ATTENDANCE
        </p>
        <div className="flex h-[4.1cqw] w-full flex-col items-center">
          {code}
        </div>
      </div>

      {/* The template's GDG footer, moved to the bottom left so the
          check-in count can sit under the code column it belongs to. */}
      <Image
        src="/brand/gdg-bracket.svg"
        alt=""
        width={32}
        height={17}
        unoptimized
        className="absolute top-[90.7%] left-[5.33%] h-[3.78%] w-auto"
      />
      <p className="absolute top-[90.52%] left-[10.07%] text-[1.064cqw] leading-[1.4] font-bold whitespace-nowrap text-white">
        Google Developer Groups
        <span className="block text-[0.917cqw] font-normal text-[#d7d0d7]">
          On Campus · University of Georgia
        </span>
      </p>

      <div className="absolute top-[90.7%] left-[73.02%] flex h-[3.78%] w-[22.93%] flex-col items-center justify-between text-center">
        {status}
      </div>
    </div>
  );
}
