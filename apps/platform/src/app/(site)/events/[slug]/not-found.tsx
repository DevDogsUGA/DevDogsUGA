import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";

/**
 * An unknown slug, rendered as the dialog's body.
 *
 * It lives in this segment rather than being left to the app-level 404 so the
 * miss stays *inside* the dialog: the calendar behind it never unmounts, and
 * the way out is one click back to it. The wording says what is actually known
 * — the link resolved to no live meeting — which covers both a typo and the
 * ordinary case of an officer archiving a night after the link was shared.
 *
 * `scroll={false}` for the same reason every route-dialog link carries it:
 * dismissing a dialog should not jump the page underneath to the top.
 */
export default function MeetingNotFound() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm/relaxed text-mauve-700">
        There is no meeting at this link. It may have been removed from the
        schedule, or the address may have a typo in it.
      </p>
      <Link
        href="/events"
        scroll={false}
        className="hover:shadow-block-md transition-lift flex w-fit items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5"
      >
        <ArrowLeftIcon /> Back to the schedule
      </Link>
    </div>
  );
}
