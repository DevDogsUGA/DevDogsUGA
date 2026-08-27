"use client";

import dynamic from "next/dynamic";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import type { DialogTone } from "~/ui/dialog-shell";
import { ACTION_DARK_CLS } from "../meetingView";
import { BUILDING_CENTERS, VIEW, type BuildingKey } from "./campusMapMeta";
import { BUILDING_NAME } from "./buildings";

/**
 * The map is the heavy part of the dialog — 46 KB of OSM paths — so it is a
 * chunk of its own, fetched when the dialog first renders. `preloadCampusMap`
 * shares the same `import()`, which the bundler resolves to the same chunk,
 * so a trigger can start that fetch the moment someone shows intent and the
 * map is usually already here by the time the dialog opens.
 */
const CampusMap = dynamic(() => import("./CampusMap"), {
  loading: () => <MapPlaceholder />,
});
export function preloadCampusMap() {
  void import("./CampusMap");
}

/**
 * The destination is a coordinate pin, not a place query: the DLW only opened
 * in August 2026, and searching either app for it by name still lands on the
 * wrong building or nothing at all. A coordinate behaves the same for all ten
 * buildings, so the rule that was written for the newest one is simply the
 * rule. The pin is the centroid of the same OSM footprint the map highlights,
 * so regenerating the map data moves both together.
 */
function mapUrls(building: BuildingKey) {
  const { lat, lon } = BUILDING_CENTERS[building];
  const destination = `${lat},${lon}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    apple: `https://maps.apple.com/?daddr=${destination}`,
  };
}

interface Props {
  /** The building to draw. Defaults to the club's usual one. */
  building?: BuildingKey;
  /** The room inside it, as an officer typed it. */
  room?: string | null;
  /** The plate the dialog is on. */
  tone?: DialogTone;
}

const TONES = {
  light: {
    prose: "text-mauve-600",
    link: "hover:shadow-block-md transition-lift flex items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5",
  },
  dark: {
    prose: "text-mauve-300",
    link: ACTION_DARK_CLS,
  },
} satisfies Record<DialogTone, Record<string, string>>;

/**
 * Everything inside the dialog below its title: the campus map with the
 * building highlighted, a line about where it is, and the hand-off to a
 * navigation app for the door-to-door part — at the bottom, on the right,
 * where a dialog's actions go.
 *
 * There used to be a second tab here, a floor plan of the walk to DLW 124
 * (`FloorPlan.tsx`, still on disk with its `ROOM_STEPS`). It is parked
 * rather than deleted: the drawing was hand-traced, and it comes back once
 * there is a real plan of the building to draw from. Until then the room is
 * in the dialog's title and the map answers the building.
 */
export default function FindUsContent({
  building = "DLW",
  room = "124",
  tone = "light",
}: Props = {}) {
  const t = TONES[tone];
  const urls = mapUrls(building);

  return (
    // A flex column rather than bare children of the shell's grid body: the
    // map is an SVG sized by `width: 100%` and its viewBox, and as a direct
    // grid item Chrome resolves its row to zero height and lets it paint
    // over whatever follows. A flex column measures it properly.
    <div className="flex flex-col gap-3">
      <CampusMap building={building} tone={tone} />

      {building === "DLW" ? (
        <p className={`text-sm/relaxed ${t.prose}`}>
          The DLW sits at the corner of E. Cloverhurst Ave and University Court
          — just below the Hill dorms, across from O-House, and downhill from
          the Tate Center. Driving? The Tate Deck is the closest visitor
          parking, about a five-minute walk away.
        </p>
      ) : (
        /* One sentence rather than the DLW's paragraph of landmarks. Writing
           nine more of those is writing nine more things that can go stale,
           and the map above already says where it is. */
        <p className={`text-sm/relaxed ${t.prose}`}>
          {room === null
            ? `This meeting is in ${BUILDING_NAME[building]}, highlighted above.`
            : `This meeting is in ${room}, ${BUILDING_NAME[building]} — highlighted above.`}
        </p>
      )}

      {/* No turn-by-turn here: people start from all over campus, so the map
          places the building and these hand off to a navigation app. */}
      <div className="flex flex-wrap justify-end gap-2">
        <DirectionsLink href={urls.google} className={t.link}>
          Google Maps
        </DirectionsLink>
        <DirectionsLink href={urls.apple} className={t.link}>
          Apple Maps
        </DirectionsLink>
      </div>
    </div>
  );
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
 * What the intercepted /events/directions route shows between the click and
 * its content arriving: the map's silhouette, since that is what the content
 * resolves to. Prefetching fetches the route down to this boundary, so this —
 * not a blank dialog — is what appears the instant the link is hit.
 */
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
      {children} <ArrowUpRightIcon />
    </a>
  );
}
