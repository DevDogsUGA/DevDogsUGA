"use client";

import dynamic from "next/dynamic";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { ACTION_DARK_CLS } from "../meetingView";
import { VIEW } from "~/components/EventsSection/FindUs/campusMapMeta";
import {
  describePlace,
  type Place,
} from "~/components/EventsSection/FindUs/place";

/**
 * The map is the heavy part of the dialog, 46 KB of OSM paths, so it is a
 * chunk of its own, fetched when the dialog first renders. `preloadCampusMap`
 * shares the same `import()`, which the bundler resolves to the same chunk, so
 * a trigger can start that fetch the moment someone shows intent and the map
 * is usually already here by the time the dialog opens.
 */
const CampusMap = dynamic(
  () => import("~/components/EventsSection/FindUs/CampusMap"),
  { loading: () => <MapPlaceholder /> },
);
export function preloadCampusMap() {
  void import("~/components/EventsSection/FindUs/CampusMap");
}

const HEADING_CLS =
  "font-display text-xs font-extrabold tracking-wide text-mauve-400 uppercase";

/**
 * Everything inside the dialog below its title, for any kind of place the
 * venue catalog describes: the campus map with the building highlighted (for
 * a mapped building), the facts as text, what an officer's walkthrough
 * verified, and the hand-off to a navigation app. An online night gets its
 * join link; a place still to be announced, or one nobody here knows, gets a
 * plain statement. Nothing the club has not verified is presented as a route.
 *
 * `heading` prints the place's own title and address lines above the body, for
 * the `/events/directions` dialog, whose frame is a layout and so cannot know
 * which place the link names.
 */
export default function FindUsContent({
  place,
  heading = false,
}: {
  place: Place;
  heading?: boolean;
}) {
  const view = describePlace(place);
  const { verified } = view;

  return (
    // A flex column rather than bare children of the shell's grid body: the
    // map is an SVG sized by `width: 100%` and its viewBox, and as a direct
    // grid item Chrome resolves its row to zero height and lets it paint
    // over whatever follows. A flex column measures it properly.
    <div className="flex flex-col gap-3">
      {heading && (
        <div className="flex flex-col gap-1">
          <p className="font-display text-xl leading-tight font-extrabold text-white">
            {view.title}
          </p>
          {view.subtitle.map((line) => (
            <p key={line} className="text-sm text-mauve-400">
              {line}
            </p>
          ))}
        </div>
      )}

      {view.mapBuilding !== null && (
        <CampusMap building={view.mapBuilding} tone="dark" />
      )}

      {view.paragraphs.map((text) => (
        <p key={text} className="text-sm/relaxed text-mauve-300">
          {text}
        </p>
      ))}

      {view.rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {view.rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-mauve-400">{row.label}</dt>
              <dd className="text-white">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {verified !== null && (
        <section aria-labelledby="fu-verified" className="flex flex-col gap-2">
          <h3 id="fu-verified" className={HEADING_CLS}>
            Getting in
          </h3>
          <p className="text-sm text-mauve-400">
            Verified by an officer on{" "}
            <time dateTime={verified.verifiedOn}>
              {formatVerifiedOn(verified.verifiedOn)}
            </time>
            .
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {verified.entrance !== undefined && (
              <>
                <dt className="text-mauve-400">Entrance</dt>
                <dd className="text-white">{verified.entrance}</dd>
              </>
            )}
            {verified.accessibleRoute !== undefined && (
              <>
                <dt className="text-mauve-400">Step-free route</dt>
                <dd className="text-white">{verified.accessibleRoute}</dd>
              </>
            )}
            {verified.notes !== undefined && (
              <>
                <dt className="text-mauve-400">Notes</dt>
                <dd className="text-white">{verified.notes}</dd>
              </>
            )}
          </dl>
          {verified.floorPlan !== undefined &&
            verified.floorPlan.startsWith("/") &&
            !verified.floorPlan.startsWith("//") && (
              // The route above is the same information in words, so the
              // image carries no claim the text does not.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={verified.floorPlan}
                alt={`Floor plan of ${view.title}`}
                className="w-full"
              />
            )}
        </section>
      )}

      {view.unverifiedNote !== null && (
        <p className="text-sm/relaxed text-mauve-400">{view.unverifiedNote}</p>
      )}

      {/* No turn-by-turn here: people start from all over campus, so the map
          places the building and these hand off to a navigation app (or,
          online, to the join link). */}
      {view.links.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {view.links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={ACTION_DARK_CLS}
            >
              {link.label} <ArrowUpRightIcon />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function formatVerifiedOn(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Holds the map's exact footprint while its chunk is in flight, so the dialog
 * opens at its final height and nothing below the map jumps when it lands.
 */
export function MapPlaceholder() {
  return (
    <div
      aria-hidden
      style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}
      // Neutral on purpose: this renders inside the dynamic import, which has
      // no tone to read, so it has to sit quietly on a white plate and a dark
      // one alike.
      className="w-full animate-pulse rounded-sm border-2 border-mauve-500/40 bg-mauve-500/20"
    />
  );
}

/**
 * What the `/events/directions` route shows between the click and its content
 * arriving: the map's silhouette, since that is what the content resolves to.
 * Prefetching fetches the route down to this boundary, so this, not a blank
 * dialog, is what appears the instant the link is hit.
 */
export function FindUsSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      <MapPlaceholder />
    </div>
  );
}
