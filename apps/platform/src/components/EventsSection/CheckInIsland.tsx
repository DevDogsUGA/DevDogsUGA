import { ClipboardTextIcon } from "@phosphor-icons/react/ssr";
import {
  attendanceFormIsLive,
  getUpcomingMeetings,
} from "~/server/loaders/meetings";
import { ACTION_CLS } from "./meetingView";

/**
 * The check-in link, and the one thing on this page that cannot be cached.
 *
 * "Is there a form to point at right now" is true for about two hours a week.
 * Everything else on the events page tolerates being a few minutes stale — a
 * meeting three days out is still three days out — but this flips to true at
 * six and back to false at eight, and a five-minute-old answer is wrong for a
 * twelfth of the window it is supposed to cover.
 *
 * So it is created OUTSIDE the layout's `"use cache"` scope and passed in as
 * an element. An element constructed outside a cache scope renders outside it
 * too, which is what keeps this read live while the page around it is served
 * from the cache entry. Rendering it *inside* the cached body instead would
 * bake one moment's answer into the entry — the same pattern, and the same
 * reason, as `StreakCTA` on the homepage.
 *
 * It re-reads the meeting rather than taking one as a prop, deliberately: a
 * prop from the cached scope would carry the cached `now` with it, and the
 * staleness this component exists to avoid would come back in through the
 * argument.
 */
export default async function CheckInIsland() {
  // Failing silently is right here. This is an affordance, not content: if the
  // read fails the page still answers "when and where", and the layout's own
  // fallback has already covered the case where nothing loaded at all.
  const meeting = await getUpcomingMeetings(1)
    .then((rows) => rows[0])
    .catch(() => undefined);
  if (!meeting) return null;

  // `attendanceFormIsLive` deliberately claims something narrow — that there
  // is a link and the meeting is happening — because the platform cannot know
  // whether the Airtable form is open. The copy has to stay a pointer for the
  // same reason: "Check in", never "Attendance open".
  if (!attendanceFormIsLive(meeting)) return null;

  return (
    <a
      href={meeting.attendanceFormUrl!}
      target="_blank"
      rel="noopener noreferrer"
      className={ACTION_CLS}
    >
      <ClipboardTextIcon /> Check in
    </a>
  );
}
