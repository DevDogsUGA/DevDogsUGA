"use client";

import dynamic from "next/dynamic";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { buttonVariants } from "~/ui/button";
import Callout from "~/ui/callout";
import { DefinitionList } from "~/ui/definition-list";
import { VIEW } from "./campusMapMeta";
import { describePlace, type Place } from "./place";

/**
 * The map is the heavy part of the dialog, 46 KB of OSM paths, so it is a
 * chunk of its own, fetched when the dialog first renders. `preloadCampusMap`
 * shares the same `import()`, which the bundler resolves to the same chunk, so
 * a trigger can start that fetch the moment someone shows intent and the map
 * is usually already here by the time the dialog opens.
 */
const CampusMap = dynamic(() => import("./CampusMap"), {
  loading: () => <MapPlaceholder />,
});
export function preloadCampusMap() {
  void import("./CampusMap");
}

interface Props {
  /** Where to send the reader; see `placeLookup` for how a link becomes one. */
  place: Place;
}

/**
 * Everything inside the drawer below its title, for any kind of place:
 *
 *   - a campus-map building: the map with it highlighted, then the text;
 *   - other campus ground and off-campus venues: the address and text only;
 *   - an online night: the join link, or where the details are;
 *   - a place still to be announced, or one we don't know: a plain statement.
 *
 * The map is decoration for sighted readers (its SVG is aria-hidden), so the
 * same information is always in text beside it: the paragraphs and the rows.
 * What an officer's walkthrough confirmed is shown with its date; everything
 * else says it has not been verified rather than implying a route.
 *
 * There used to be a second tab here, a floor plan of the walk to DLW 124
 * (`FloorPlan.tsx`, still on disk with its `ROOM_STEPS`). It stays parked: the
 * drawing was hand-traced and is not restored. Floor plans come back only as a
 * verified `floorPlan` on the venue.
 */
export default function FindUsContent({ place }: Props) {
  const view = describePlace(place);
  const linkClass = buttonVariants({ variant: "secondary", size: "sm" });
  const { verified } = view;

  return (
    // A flex column rather than bare children of a grid body: the map is an
    // SVG sized by `width: 100%` and its viewBox, and as a direct grid item
    // Chrome resolves its row to zero height and lets it paint over whatever
    // follows. A flex column measures it properly.
    <div className="flex flex-col gap-4">
      {view.mapBuilding !== null && (
        <CampusMap building={view.mapBuilding} tone="dark" />
      )}

      {view.paragraphs.map((text) => (
        <p key={text} className="small muted m-0">
          {text}
        </p>
      ))}

      {view.rows.length > 0 && (
        <DefinitionList
          items={view.rows.map((row) => ({
            key: row.label,
            term: row.label,
            detail: row.value,
          }))}
        />
      )}

      {verified !== null && (
        <section aria-labelledby="fu-verified" className="flex flex-col gap-2">
          <h3 id="fu-verified" className="m-0">
            Getting in
          </h3>
          <p className="small muted m-0">
            Verified by an officer on{" "}
            <time dateTime={verified.verifiedOn}>
              {formatVerifiedOn(verified.verifiedOn)}
            </time>
            .
          </p>
          <DefinitionList
            items={[
              ...(verified.entrance === undefined
                ? []
                : [
                    {
                      key: "entrance",
                      term: "Entrance",
                      detail: verified.entrance,
                    },
                  ]),
              ...(verified.accessibleRoute === undefined
                ? []
                : [
                    {
                      key: "accessible",
                      term: "Step-free route",
                      detail: verified.accessibleRoute,
                    },
                  ]),
              ...(verified.notes === undefined
                ? []
                : [{ key: "notes", term: "Notes", detail: verified.notes }]),
            ]}
          />
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
        <Callout tone="info" title="Not verified yet">
          {view.unverifiedNote}
        </Callout>
      )}

      {/* No turn-by-turn here: people start from all over, so the map places
          the building and these hand off to a navigation app (or, online, to
          the join link). */}
      {view.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {view.links.map((link) => (
            <DirectionsLink
              key={link.label}
              href={link.url}
              className={linkClass}
            >
              {link.label}
            </DirectionsLink>
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
 * Holds the map's exact footprint while its chunk is in flight, so the drawer
 * opens at its final height and nothing below the map jumps when it lands.
 */
export function MapPlaceholder() {
  return (
    <div
      aria-hidden
      style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}
      className="skel w-full"
    />
  );
}

/** The map's silhouette, for the moment before the drawer's content arrives. */
export function FindUsSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      <MapPlaceholder />
    </div>
  );
}

function DirectionsLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children} <ArrowUpRightIcon weight="bold" aria-hidden />
    </a>
  );
}
