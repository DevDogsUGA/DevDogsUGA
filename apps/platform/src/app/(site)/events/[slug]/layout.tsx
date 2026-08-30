import { CalendarDotsIcon } from "@phosphor-icons/react/ssr";
import { formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { cancellationNotice } from "~/components/EventsSection/meetingView";
import {
  getMeetingBySlug,
  type MeetingSummary,
} from "~/server/loaders/meetings";
import { DialogDescription, DialogTitle } from "~/ui/dialog";
import RouteDialog from "~/ui/route-dialog";

/**
 * The dialog frame for one meeting, mirroring `directions/layout.tsx`.
 *
 * The frame is the segment's *layout* and the meeting body is its page, so
 * `loading.tsx`, which Next wraps around the page and inside this, draws its
 * skeleton inside an already-open dialog instead of replacing the dialog. That
 * split is also the prefetch boundary: under the cookie-reading `(site)` layout
 * every route is dynamic, and a dynamic route is prefetched down to its first
 * loading boundary, which is this frame.
 *
 * `closeTo="/events"` because that is the layout holding the calendar behind the
 * dialog, so a cold-loaded meeting closes onto the calendar rather than an empty
 * tab.
 *
 * ## Why the layout reads the meeting too
 *
 * `DialogShell` takes the header from whoever owns the frame, and Radix needs a
 * `DialogTitle` inside the content for the dialog's accessible name, so the
 * title has to be rendered here, not in the body. A static "Meeting" title lies
 * about which one is open, and a title rendered in the body scrolls away and
 * leaves the dialog named after nothing.
 *
 * So this awaits `getMeetingBySlug` as well. That costs nothing extra: the
 * loader is `cache()`-wrapped, so the page's own call in the same request is the
 * same promise, not a second query. It does cost the frame waiting on one
 * indexed slug lookup before the dialog can paint. The prefetch above already
 * fetches that on hover, so by the time a click lands the frame is normally in
 * the router cache and the dialog opens with the real name over `loading.tsx`'s
 * skeleton.
 *
 * It deliberately does NOT call `notFound()` on a missing meeting. A layout's
 * `notFound()` escapes to the PARENT segment's boundary, which would replace the
 * whole dialog, and the calendar behind it, with a full-page 404. Left to the
 * page, the interrupt lands on `not-found.tsx` in this segment, which renders
 * inside this frame; the header falls back to saying so.
 */
export default async function MeetingModalLayout({
  children,
  params,
}: LayoutProps<"/events/[slug]">) {
  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);

  return (
    // `pair="primary"`: the Directions button in the body opens a nested dialog,
    // and on a wide viewport the two sit side by side. See DialogShell.
    <RouteDialog
      header={<MeetingHeader meeting={meeting} />}
      closeTo="/events"
      tone="dark"
      pair="primary"
    >
      {children}
    </RouteDialog>
  );
}

/**
 * Name over span, the two things that stay true for the whole dialog. The span
 * lives here rather than in the body because the header does not scroll: "what
 * and when" should still be on screen at the bottom of a long agenda. It also
 * doubles as the dialog's accessible description.
 */
function MeetingHeader({ meeting }: { meeting: MeetingSummary | null }) {
  // ⚠️ `DialogTitle` and `DialogDescription` ARE the dialog's accessible name
  // and description, so whatever they say is the whole of what a screen-reader
  // user is told when the dialog opens.
  //
  // Before this, that was the meeting's name and "6:00 – 8:00 PM" and nothing
  // else, with the cancellation further down the body, in the part that scrolls.
  // A sighted reader would eventually see the notice; somebody hearing the
  // dialog announced was told only when and where to turn up.
  const notice = meeting === null ? null : cancellationNotice(meeting);

  return (
    <div className="flex flex-col gap-2">
      <DialogTitle className="font-display flex items-start gap-2 text-2xl leading-tight font-extrabold text-white">
        <CalendarDotsIcon
          className="mt-0.5 shrink-0 text-mauve-400"
          weight="fill"
        />
        {/* `meetingTitle`, not `nameOverride`: this is the dialog's accessible
            name, the thing Radix announces on open. Reading the column directly
            would make "Meeting not found" the announced name of every meeting
            that WAS found, since most nights have no authored name. The null
            branch belongs to a genuinely missing slug. */}
        {meeting ? meetingTitle(meeting) : "Meeting not found"}
      </DialogTitle>
      <DialogDescription className="text-sm text-mauve-400">
        {meeting === null ? (
          "No meeting on the schedule matches this link."
        ) : notice === null ? (
          formatEventSpan(meeting.startsAt, meeting.endsAt)
        ) : (
          // The notice leads and the span follows it, struck through. Order is
          // the point: this string is read out in sequence, and a listener who
          // stops after the first clause has still heard the only thing that
          // changes what they do tonight.
          <>
            <span className="font-semibold text-rose-300">{notice}</span>{" "}
            <span className="line-through">
              {formatEventSpan(meeting.startsAt, meeting.endsAt)}
            </span>
          </>
        )}
      </DialogDescription>
    </div>
  );
}
