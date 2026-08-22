"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { DLW_CENTER, VIEW } from "./campusMapMeta";
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
 * wrong building or nothing at all. The pin is the centroid of the same OSM
 * footprint the map highlights, so regenerating the map data moves both
 * together if the mapping ever improves.
 */
const DESTINATION = `${DLW_CENTER.lat},${DLW_CENTER.lon}`;
const GOOGLE_MAPS_URL = `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}`;
const APPLE_MAPS_URL = `https://maps.apple.com/?daddr=${DESTINATION}`;

const STEP_CHIP_CLS =
  "mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-rose-400 text-[0.625rem] font-bold text-black";

const TABS = [
  { id: "building", label: "To the building" },
  { id: "room", label: "To Room 124" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** The tabs and their panels — everything inside the dialog below its title. */
export default function FindUsContent() {
  const [tab, setTab] = useState<TabId>("building");

  return (
    <>
      <div role="tablist" aria-label="Directions" className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`findus-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`findus-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-sm border-2 border-black px-3 py-1.5 text-xs font-bold transition-[background-color,box-shadow] ${
              tab === t.id
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
        id={`findus-panel-${tab}`}
        aria-labelledby={`findus-tab-${tab}`}
        className="flex flex-col gap-3"
      >
        {tab === "building" ? (
          <>
            <CampusMap />
            {/* No turn-by-turn here: people start from all over campus, so
                the map just places the building and the buttons below hand
                off to a navigation app for the door-to-door part. */}
            <div className="flex flex-wrap gap-2">
              <DirectionsLink href={GOOGLE_MAPS_URL}>
                Google Maps
              </DirectionsLink>
              <DirectionsLink href={APPLE_MAPS_URL}>Apple Maps</DirectionsLink>
            </div>
            <p className="text-sm/relaxed text-mauve-600">
              The DLW sits at the corner of E. Cloverhurst Ave and University
              Court — just below the Hill dorms, across from O-House, and
              downhill from the Tate Center. Driving? The Tate Deck is the
              closest visitor parking, about a five-minute walk away.
            </p>
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
