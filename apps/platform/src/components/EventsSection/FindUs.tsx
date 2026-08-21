"use client";

import { useState } from "react";
import {
  ArrowUpRightIcon,
  MapPinIcon,
  MapTrifoldIcon,
} from "@phosphor-icons/react/ssr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";
import { BUILDINGS, ROADS, ROUTE, ROUTE_START, VIEW } from "./campusMapData";

/**
 * The destination is passed as a place query rather than coordinates: the DLW
 * only opened in August 2026, and a hardcoded lat/lng guessed before the map
 * providers finish indexing it would drop the pin on the wrong roof forever.
 * A name query self-corrects as their data catches up.
 */
const DESTINATION = encodeURIComponent(
  "Dining, Learning, and Well-Being Center, University of Georgia, Athens, GA",
);
const GOOGLE_MAPS_URL = `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}`;
const APPLE_MAPS_URL = `https://maps.apple.com/?daddr=${DESTINATION}`;

const STEP_CHIP_CLS =
  "mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-rose-400 text-[0.625rem] font-bold text-black";

const CAMPUS_STEPS = [
  "From the Tate Center bus stops, cross S. Lumpkin St and follow it south, downhill past the Hill Community dorms.",
  "Turn right onto University Court, keeping O-House on your left.",
  "The DLW is the big new building straight ahead, where University Ct curls into E. Cloverhurst Ave.",
  "Driving? The Tate Deck is the closest visitor parking, about a five-minute walk away.",
];

const ROOM_STEPS = [
  "Come in through the main entrance on E. Cloverhurst Ave.",
  "Skip the stairs — dining is on floors 2 and 3, and we stay on 1.",
  "Head into the first-floor classroom hallway: Room 124 has the DevDogs sign on the door.",
];

const TABS = [
  { id: "building", label: "To the building" },
  { id: "room", label: "To Room 124" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** OSM's name for the building the map highlights. */
const DLW_OSM_NAME = "Dining, Learning and Well-being Center";

/**
 * Label anchors placed by eye against the generated footprint coordinates
 * (each building's centroid is printed when the generator runs) — nudged off
 * roads and off each other, so re-check after regenerating campusMapData.
 */
const BUILDING_LABELS: { text: string; x: number; y: number }[] = [
  { text: "Brumby", x: 22, y: 165 },
  { text: "Russell", x: 68, y: 153 },
  { text: "Creswell", x: 112, y: 153 },
  { text: "The Hill", x: 198, y: 126 },
  { text: "Bolton", x: 229, y: 75 },
  { text: "MLC", x: 308, y: 66 },
  { text: "Tate Center", x: 319, y: 127 },
  { text: "Tate Deck", x: 267, y: 127 },
  { text: "Oglethorpe House & Dining", x: 161, y: 296 },
  { text: "Boyd", x: 330, y: 352 },
  { text: "Science Library", x: 290, y: 346 },
  { text: "Physics", x: 320, y: 216 },
  { text: "Snelling", x: 276, y: 404 },
  { text: "Sanford Stadium", x: 405, y: 141 },
  { text: "Journalism", x: 385, y: 44 },
];

export default function FindUs() {
  const [tab, setTab] = useState<TabId>("building");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="hover:shadow-block-md transition-lift flex items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5">
          <MapTrifoldIcon /> Directions
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-full overflow-y-auto rounded-sm border-2 border-black bg-white p-5 text-black ring-0 sm:max-w-xl">
        <div className="flex flex-col gap-2">
          <DialogTitle className="font-display flex items-center gap-2 text-2xl leading-none font-extrabold text-black">
            <MapPinIcon className="text-mauve-500" weight="fill" />
            How to find us
          </DialogTitle>
          <DialogDescription className="text-sm text-mauve-600">
            Every event happens in DLW 124 — the new Dining, Learning &
            Well-Being center on West Campus.
          </DialogDescription>
        </div>

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
              <div className="flex flex-wrap gap-2">
                <DirectionsLink href={GOOGLE_MAPS_URL}>
                  Google Maps
                </DirectionsLink>
                <DirectionsLink href={APPLE_MAPS_URL}>
                  Apple Maps
                </DirectionsLink>
              </div>
              <StepList steps={CAMPUS_STEPS} />
            </>
          ) : (
            <>
              <FloorPlan />
              <StepList steps={ROOM_STEPS} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
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

/**
 * Real geometry, not a sketch: road centerlines and building footprints come
 * from OpenStreetMap via scripts/generate-campus-map.ts, projected into the
 * viewBox. Labels are placed by eye against those generated coordinates —
 * after regenerating campusMapData, re-check them against the rendered map.
 */
function CampusMap() {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      className="w-full rounded-sm border-2 border-black"
    >
      <rect width={VIEW.w} height={VIEW.h} className="fill-orange-50" />

      {/* Roads: every black casing first, then every white surface, so the
          surfaces run together at junctions instead of butting into casings */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {Object.entries(ROADS).map(([name, d]) => (
          <path key={name} d={d} className="stroke-black" strokeWidth="10" />
        ))}
        {Object.entries(ROADS).map(([name, d]) => (
          <path key={name} d={d} className="stroke-white" strokeWidth="6.5" />
        ))}
      </g>

      {/* Building footprints, the DLW's highlighted */}
      {BUILDINGS.map((b) =>
        b.name === DLW_OSM_NAME ? (
          <path
            key={b.name}
            d={b.d}
            className="fill-rose-400 stroke-black"
            strokeWidth="2.5"
          />
        ) : (
          <path
            key={b.name}
            d={b.d}
            className="fill-white stroke-black"
            strokeWidth="1.5"
          />
        ),
      )}
      <g
        textAnchor="middle"
        fontSize="8"
        className="fill-mauve-600 font-semibold"
      >
        {BUILDING_LABELS.map((l) => (
          <text key={l.text} x={l.x} y={l.y}>
            {l.text}
          </text>
        ))}
      </g>

      {/* Walking route: the Tate crossing on S. Lumpkin → University Ct → DLW,
          with a dot marking the start by the Tate bus stops */}
      <circle
        cx={ROUTE_START[0]}
        cy={ROUTE_START[1]}
        r="4.5"
        className="fill-rose-600 stroke-black"
        strokeWidth="1.5"
      />
      <path
        d={ROUTE}
        fill="none"
        className="stroke-rose-600"
        strokeWidth="3"
        strokeDasharray="7 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Destination pin on the DLW, name called out in the open block west
          of it (the footprint is too small to hold its own label) */}
      <circle
        cx="148"
        cy="176"
        r="7"
        className="fill-rose-600 stroke-black"
        strokeWidth="2"
      />
      <path d="M 142.6 180 L 153.4 180 L 148 191 Z" className="fill-rose-600" />
      <line
        x1="91"
        y1="199"
        x2="133"
        y2="190"
        className="stroke-mauve-400"
        strokeWidth="1"
      />
      <g textAnchor="middle">
        <text
          x="66"
          y="201"
          fontSize="14"
          className="font-display fill-black font-extrabold"
        >
          DLW
        </text>
        <text
          x="64"
          y="213"
          fontSize="6.5"
          className="fill-black font-semibold"
        >
          Dining, Learning
        </text>
        <text
          x="64"
          y="222"
          fontSize="6.5"
          className="fill-black font-semibold"
        >
          &amp; Well-Being Center
        </text>
      </g>

      {/* Road labels, angled along their roads */}
      <g fontSize="9" className="fill-mauve-700 font-bold">
        <text x="32" y="95" transform="rotate(-12.5 32 95)">
          Baxter St
        </text>
        <text x="252" y="192" transform="rotate(-76 252 192)">
          S. Lumpkin St
        </text>
        <text x="43" y="299" transform="rotate(-67.5 43 299)">
          E. Cloverhurst Ave
        </text>
        <text x="178" y="259" fontSize="8" transform="rotate(23 178 259)">
          University Ct
        </text>
        <text x="285" y="328" fontSize="8" transform="rotate(-78 285 328)">
          Sanford Dr
        </text>
        <text x="371" y="335" fontSize="8" transform="rotate(-90 371 335)">
          D.W. Brooks Dr
        </text>
      </g>

      {/* Compass + the ODbL attribution OSM data requires */}
      <text
        x="24"
        y="40"
        textAnchor="middle"
        fontSize="13"
        className="font-display fill-black font-extrabold"
      >
        N ↑
      </text>
      <text
        x="474"
        y="409"
        textAnchor="end"
        fontSize="6.5"
        className="fill-mauve-400"
      >
        Map data © OpenStreetMap
      </text>
    </svg>
  );
}

/**
 * Schematic, not measured: the first floor really does split into a classroom
 * wing and a health & well-being wing with dining upstairs (that comes from the
 * architects' program), but the corridor shape and where 124 falls along it are
 * sketched. If the room ever moves or the wing flips, redraw here and reword
 * ROOM_STEPS together — the numbered chips on the route are steps 1–3 of that
 * list.
 */
function FloorPlan() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 480 300"
      className="w-full rounded-sm border-2 border-black"
    >
      <rect width="480" height="300" className="fill-orange-50" />

      {/* Building shell */}
      <rect
        x="36"
        y="24"
        width="408"
        height="228"
        className="fill-white stroke-black"
        strokeWidth="3"
      />

      {/* Health & well-being wing */}
      <rect
        x="52"
        y="40"
        width="150"
        height="102"
        rx="2"
        className="fill-orange-100 stroke-black"
        strokeWidth="2"
      />
      <text
        x="127"
        y="86"
        textAnchor="middle"
        fontSize="10"
        className="fill-black font-semibold"
      >
        Health &amp;
      </text>
      <text
        x="127"
        y="99"
        textAnchor="middle"
        fontSize="10"
        className="fill-black font-semibold"
      >
        Well-Being wing
      </text>

      {/* Stairs up to dining */}
      <rect
        x="52"
        y="170"
        width="106"
        height="62"
        rx="2"
        className="fill-orange-200 stroke-black"
        strokeWidth="2"
      />
      <text
        x="105"
        y="196"
        textAnchor="middle"
        fontSize="10"
        className="fill-black font-semibold"
      >
        Stairs ↑
      </text>
      <text
        x="105"
        y="209"
        textAnchor="middle"
        fontSize="9"
        className="fill-mauve-700"
      >
        dining, floors 2–3
      </text>

      {/* Classroom wing along the top of the corridor */}
      <g className="fill-white stroke-black" strokeWidth="2">
        <rect x="218" y="40" width="64" height="102" rx="2" />
        <rect x="288" y="40" width="64" height="102" rx="2" />
      </g>
      <rect
        x="358"
        y="40"
        width="70"
        height="102"
        rx="2"
        className="fill-rose-400 stroke-black"
        strokeWidth="3"
      />
      <text
        x="250"
        y="96"
        textAnchor="middle"
        fontSize="12"
        className="fill-mauve-500 font-bold"
      >
        120
      </text>
      <text
        x="320"
        y="96"
        textAnchor="middle"
        fontSize="12"
        className="fill-mauve-500 font-bold"
      >
        122
      </text>
      <text
        x="393"
        y="90"
        textAnchor="middle"
        fontSize="16"
        className="font-display fill-black font-extrabold"
      >
        124
      </text>
      <text
        x="393"
        y="106"
        textAnchor="middle"
        fontSize="9"
        className="fill-black font-semibold"
      >
        DevDogs
      </text>

      {/* Corridor + lobby labels sit in the leftover white */}
      <text
        x="322"
        y="178"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-400 font-semibold tracking-wide"
      >
        CLASSROOM HALLWAY
      </text>
      <text
        x="240"
        y="226"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-400 font-semibold tracking-wide"
      >
        LOBBY
      </text>

      {/* Door gap in the shell, then the entrance callout below it */}
      <line
        x1="216"
        y1="252"
        x2="264"
        y2="252"
        className="stroke-white"
        strokeWidth="5"
      />
      <text
        x="240"
        y="286"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-700 font-bold"
      >
        Main entrance — E. Cloverhurst Ave
      </text>

      {/* Route: in the door, across the lobby, right down the hallway to 124 */}
      <path
        d="M 240 268 L 240 155 L 393 155 L 393 148"
        fill="none"
        className="stroke-rose-600"
        strokeWidth="3"
        strokeDasharray="7 5"
        strokeLinejoin="round"
      />
      <path d="M 393 142 l -6 9 h 12 z" className="fill-rose-600" />
      <g className="fill-rose-600">
        <circle cx="240" cy="245" r="8" />
        <circle cx="240" cy="192" r="8" />
        <circle cx="330" cy="155" r="8" />
      </g>
      <g textAnchor="middle" fontSize="10" className="fill-white font-bold">
        <text x="240" y="248.5">
          1
        </text>
        <text x="240" y="195.5">
          2
        </text>
        <text x="330" y="158.5">
          3
        </text>
      </g>
    </svg>
  );
}
