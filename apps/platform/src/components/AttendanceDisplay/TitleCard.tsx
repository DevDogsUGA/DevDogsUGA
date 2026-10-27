import "./display.css";

import type { ReactNode } from "react";
import {
  CATEGORY_LABEL,
  meetingCategory,
} from "~/components/EventsSection/meetingView";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { formatMeetingWhen } from "~/components/participation/when";
import { Chip } from "~/ui/chip";

/** The address printed under the code, for anyone who can't scan. */
export const CHECK_IN_ADDRESS = "devdogsuga.org/attendance";

/**
 * Everything the slide is allowed to draw from -- the `meetings` row a
 * `@devdogsuga/events` config entry becomes once synced, nothing hand-typed
 * per meeting. See `getOfficerAttendanceMeeting` for where these fields are
 * selected.
 */
export interface TitleCardMeeting {
  title: string;
  category: string | null;
  building: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Builds a {@link TitleCardMeeting} from a `getOfficerAttendanceMeeting` row
 * plus its already-computed display title -- the one mapping shared by the
 * boxed officer page and the full-viewport `(present)` route, so the two
 * can't drift on which fields the slide is allowed to draw from.
 */
export function toTitleCardMeeting(
  meeting: {
    category: string | null;
    building: string | null;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
  },
  title: string,
): TitleCardMeeting {
  return {
    title,
    category: meeting.category,
    building: meeting.building,
    location: meeting.location,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
  };
}

/**
 * The projector display (`console-display.html`): the meeting's category chip,
 * title and when/where, then the two steps -- scan the QR, then type the code.
 *
 * A 16:9 stage letterboxed into whatever box it gets, every measure in `cqw`
 * of the stage, so it lays out the same in the console card and on a
 * projector. Deliberately dumb: the text draws only from
 * {@link TitleCardMeeting}; the code itself arrives through the slots.
 */
export default function TitleCard({
  meeting,
  onReveal,
  qr,
  right,
  count,
}: {
  meeting: TitleCardMeeting;
  onReveal: () => void;
  /** The square under step 1: the QR, or the dashed "press a key" box, or the paused box. */
  qr: ReactNode;
  /** The right column from step 2 down. */
  right: ReactNode;
  /** The checked-in count, top right. */
  count: ReactNode;
}) {
  const category = meetingCategory({ category: meeting.category });
  const where = locationLine(meeting.building, meeting.location);
  const when = [formatMeetingWhen(meeting.startsAt, meeting.endsAt), where]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onReveal}
      aria-label={`Show the check-in code for ${meeting.title}`}
      className="disp-stage"
      data-kind={category}
    >
      <div className="disp-a" style={{ left: "5cqw", top: "4.5833cqw" }}>
        <Chip kind={category}>{CATEGORY_LABEL[category]}</Chip>
      </div>
      <h1
        className="disp-a disp-title"
        style={{ left: "5cqw", top: "8.9583cqw", width: "80cqw" }}
      >
        {meeting.title}
      </h1>
      <div
        className="disp-a disp-meta"
        style={{ left: "5cqw", top: "15.625cqw", fontSize: "2.0833cqw" }}
      >
        {when}
      </div>
      <div
        className="disp-a disp-step"
        style={{ left: "5cqw", top: "21.8cqw" }}
      >
        <b aria-hidden>1</b>Scan to check in
      </div>
      <div className="disp-a disp-qr">{qr}</div>
      {right}
      {count}
    </div>
  );
}
