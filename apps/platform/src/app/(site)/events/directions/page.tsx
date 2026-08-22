import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import FindUsContent from "~/components/EventsSection/FindUs/FindUsContent";
import {
  FIND_US_BLURB,
  FIND_US_TITLE,
} from "~/components/EventsSection/FindUs/copy";
import UnderConstruction from "~/components/UnderConstruction";

export const metadata: Metadata = {
  title: "Directions | DevDogs",
  description: FIND_US_BLURB,
};

/**
 * `/events/directions` as a page of its own: what a shared link, a refresh, or
 * a navigation from anywhere outside /events lands on. From the events page
 * the same URL is intercepted into a dialog instead (see `events/@modal`), so
 * this is the dialog's content in a card — same title, same tabs — with a way
 * back to the calendar in place of a close button.
 */
export default function DirectionsPage() {
  if (process.env.DEPLOY_ENV === "production") return <UnderConstruction />;

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12">
      <div className="flex flex-col gap-4 rounded-sm border-2 border-black bg-white p-5 text-black">
        <div className="flex flex-col gap-2">
          <h1 className="font-display flex items-center gap-2 text-2xl leading-none font-extrabold">
            <MapPinIcon className="text-mauve-500" weight="fill" />
            {FIND_US_TITLE}
          </h1>
          <p className="text-sm text-mauve-600">{FIND_US_BLURB}</p>
        </div>
        <FindUsContent />
      </div>
      <Link
        href="/events"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mauve-300 hover:text-white"
      >
        <ArrowLeftIcon /> All events
      </Link>
    </div>
  );
}
