"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { BUILDING_CENTERS, VIEW, type BuildingKey } from "./campusMapMeta";
import { BUILDING_NAME } from "./buildings";
import FloorPlan, { ROOM_STEPS } from "./FloorPlan";

/**
 * The map is the heavy part of the dialog — the floor plan is a few dozen
 * rects, the map is 46 KB of OSM paths — so it is a chunk of its own, fetched
 * when the building tab first renders. `preloadCampusMap` shares the same
 * `import()`, which the bundler resolves to the same chunk, so a trigger can
 * start that fetch the moment someone shows intent and the map is usually
 * already here by the time the dialog opens.
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

/**
 * The room the floor plan describes, or null if this meeting is not in it.
 *
 * The drawing is not "a plan of the DLW", it is the walk to room 124 —
 * `ROOM_STEPS` names its doors and its staircase — so it is offered for that
 * room and nothing else. A meeting in DLW 148 gets the campus map and no
 * second tab, which is the honest answer rather than a drawing of the wrong
 * corridor.
 *
 * This does read the free-text room, which the `building` column exists to
 * stop anything doing. It is a different kind of read: getting it wrong hides
 * a drawing rather than asserting a false one, and there is no room list to
 * match against — rooms are typed, and always will be. It returns the number
 * rather than a boolean so the tab's label comes from the same test that
 * decided there is a tab.
 */
const FLOOR_PLAN_ROOM = "124";

function floorPlanRoom(building: BuildingKey, room: string | null) {
  if (building !== "DLW" || room === null) return null;
  return new RegExp(`\\b${FLOOR_PLAN_ROOM}\\b`).test(room)
    ? FLOOR_PLAN_ROOM
    : null;
}

const STEP_CHIP_CLS =
  "mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-rose-400 text-[0.625rem] font-bold text-black";

type TabId = "building" | "room";

interface Props {
  /** The building to draw. Defaults to the club's usual one. */
  building?: BuildingKey;
  /** The room inside it, as an officer typed it. */
  room?: string | null;
}

/** The tabs and their panels — everything inside the dialog below its title. */
export default function FindUsContent({
  building = "DLW",
  room = "124",
}: Props = {}) {
  const [tab, setTab] = useState<TabId>("building");
  const urls = mapUrls(building);
  // One tab is not a tablist, it is a heading with extra steps — so when there
  // is no room-level drawing the whole control disappears rather than sitting
  // there as a single permanently-selected button.
  const planRoom = floorPlanRoom(building, room);
  const tabs: { id: TabId; label: string }[] = [
    { id: "building", label: "To the building" },
    ...(planRoom === null
      ? []
      : [{ id: "room" as const, label: `To Room ${planRoom}` }]),
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : "building";

  return (
    <>
      <div
        role="tablist"
        aria-label="Directions"
        className={`flex gap-2 ${tabs.length > 1 ? "" : "hidden"}`}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`findus-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`findus-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-sm border-2 border-black px-3 py-1.5 text-xs font-bold transition-[background-color,box-shadow] ${
              active === t.id
                ? "shadow-block-sm bg-rose-400 text-black"
                : "bg-white text-mauve-600 hover:bg-rose-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`findus-panel-${active}`}
        aria-labelledby={`findus-tab-${active}`}
        className="flex flex-col gap-3"
      >
        {active === "building" ? (
          <>
            <CampusMap building={building} />
            {/* No turn-by-turn here: people start from all over campus, so
                the map just places the building and the buttons below hand
                off to a navigation app for the door-to-door part. */}
            <div className="flex flex-wrap gap-2">
              <DirectionsLink href={urls.google}>Google Maps</DirectionsLink>
              <DirectionsLink href={urls.apple}>Apple Maps</DirectionsLink>
            </div>
            {building === "DLW" ? (
              <p className="text-sm/relaxed text-mauve-600">
                The DLW sits at the corner of E. Cloverhurst Ave and University
                Court — just below the Hill dorms, across from O-House, and
                downhill from the Tate Center. Driving? The Tate Deck is the
                closest visitor parking, about a five-minute walk away.
              </p>
            ) : (
              /* One sentence rather than the DLW's paragraph of landmarks.
                 Writing nine more of those is writing nine more things that
                 can go stale, and the map above already says where it is. */
              <p className="text-sm/relaxed text-mauve-600">
                {room === null
                  ? `This meeting is in ${BUILDING_NAME[building]}, highlighted above.`
                  : `This meeting is in ${room}, ${BUILDING_NAME[building]} — highlighted above.`}
              </p>
            )}
          </>
        ) : (
          <>
            <FloorPlan />
            <StepList steps={ROOM_STEPS} />
          </>
        )}
      </div>
    </>
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
      className="w-full animate-pulse rounded-sm border-2 border-black bg-orange-50"
    />
  );
}

/**
 * What the intercepted /events/directions route shows between the click and
 * its content arriving: the default tab's silhouette, since that is what the
 * content resolves to. Prefetching fetches the route down to this boundary,
 * so this — not a blank dialog — is what appears the instant the link is hit.
 */
export function FindUsSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      <div aria-hidden className="flex gap-2">
        <div className="shadow-block-sm h-8 w-28 rounded-sm border-2 border-black bg-rose-400" />
        <div className="h-8 w-24 rounded-sm border-2 border-black bg-white" />
      </div>
      <MapPlaceholder />
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    /* The list, not the drawing, is the accessible version of the route —
       both SVGs are aria-hidden so screen readers get one copy, not two. */
    <ol className="flex flex-col gap-1.5 text-sm/relaxed text-mauve-600">
      {steps.map((step, i) => (
        <li key={step} className="flex items-start gap-2">
          <span aria-hidden className={STEP_CHIP_CLS}>
            {i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

function DirectionsLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:shadow-block-md transition-lift flex items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5"
    >
      {children} <ArrowUpRightIcon />
    </a>
  );
}
