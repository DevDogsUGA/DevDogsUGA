import { CalendarDotsIcon } from "@phosphor-icons/react/ssr";
import { formatEventSpan } from "~/lib/eventTime";
import {
  getMeetingBySlug,
  type MeetingSummary,
} from "~/server/loaders/meetings";
import { DialogDescription, DialogTitle } from "~/ui/dialog";
import RouteDialog from "~/ui/route-dialog";

/**
 * The dialog frame for one meeting, mirroring `directions/layout.tsx`: the
 * frame is the segment's *layout* and the meeting body is its page, so
 * `loading.tsx` — which Next wraps around the page, inside this — draws its
 * skeleton inside an already-open dialog instead of replacing the dialog. That
 * split is also the prefetch boundary: under the cookie-reading `(site)`
 * layout every route is dynamic, and a dynamic route is prefetched down to its
 * first loading boundary, which is exactly this frame.
 *
 * `closeTo="/events"` because that is the layout holding the calendar behind
 * the dialog, so a cold-loaded meeting closes onto the calendar rather than an
 * empty tab.
 *
 * ## Why the layout reads the meeting too
 *
 * `DialogShell` takes the header from whoever owns the frame, and Radix needs
 * a `DialogTitle` inside the content for the dialog's accessible name — so the
 * title has to be rendered here, not in the body. The alternatives were worse:
 * a static "Meeting" title lies about which one is open, and a title rendered
 * in the body scrolls away and leaves the dialog named after nothing.
 *
 * So this awaits `getMeetingBySlug` as well. It costs nothing extra: the
 * loader is `cache()`-wrapped, so the page's own call in the same request is
 * the same promise, not a second query. What it does cost is that the frame
 * itself now waits on one indexed slug lookup before the dialog can paint —
 * which is precisely what the prefetch above already fetches on hover, so by
 * the time a click lands the frame is normally in the router cache and the
 * dialog opens with the real name over `loading.tsx`'s skeleton.
 *
 * It deliberately does NOT call `notFound()` on a missing meeting. A layout's
 * `notFound()` escapes to the PARENT segment's boundary, which would replace
 * the whole dialog — and the calendar behind it — with a full-page 404. Left
 * to the page, the interrupt lands on `not-found.tsx` in this segment, which
 * renders inside this frame; the header falls back to saying so.
 */
export default async function MeetingModalLayout({
  children,
  params,
}: LayoutProps<"/events/[slug]">) {
  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);

  return (
    <RouteDialog header={<MeetingHeader meeting={meeting} />} closeTo="/events">
      {children}
    </RouteDialog>
  );
}

/**
 * Name over span, the two things that stay true for the whole dialog. The span
 * lives here rather than in the body because the header is the part that does
 * not scroll — "what and when" should still be on screen at the bottom of a
 * long agenda — and because it doubles as the dialog's accessible description.
 */
function MeetingHeader({ meeting }: { meeting: MeetingSummary | null }) {
  return (
    <div className="flex flex-col gap-2">
      <DialogTitle className="font-display flex items-start gap-2 text-2xl leading-tight font-extrabold text-black">
        <CalendarDotsIcon
          className="mt-0.5 shrink-0 text-mauve-500"
          weight="fill"
        />
        {meeting?.name ?? "Meeting not found"}
      </DialogTitle>
      <DialogDescription className="text-sm text-mauve-600">
        {meeting
          ? formatEventSpan(meeting.startsAt, meeting.endsAt)
          : "No meeting on the schedule matches this link."}
      </DialogDescription>
    </div>
  );
}
