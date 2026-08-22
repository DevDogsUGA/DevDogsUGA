/**
 * The campus map, in a module of its own so the ~46 KB of OSM path data
 * behind it stays out of the eager bundle: FindUsContent loads this with
 * next/dynamic and warms it on hover/focus/touch. Keep everything that
 * imports campusMapData in here, or that split quietly stops being one.
 */
import {
  DLW_FOOTPRINT,
  FOOTPRINTS,
  MAJOR_ROADS,
  MINOR_ROADS,
} from "./campusMapData";
import { VIEW } from "./campusMapMeta";

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

/**
 * Real geometry, not a sketch: road centerlines and building footprints come
 * from OpenStreetMap via scripts/generate-campus-map.ts, projected into the
 * viewBox. Labels are placed by eye against those generated coordinates —
 * after regenerating campusMapData, re-check them against the rendered map.
 */
export default function CampusMap() {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      className="w-full rounded-sm border-2 border-black"
    >
      <rect width={VIEW.w} height={VIEW.h} className="fill-orange-50" />

      {/* Roads: minor drives first and thin, then the cased streets — each
          tier's casing before its white surface, so surfaces run together at
          junctions instead of butting into casings. The base map is drawn in
          muted mauve throughout; black is reserved for the DLW, its pin, and
          the callout, so the one building that matters is the one that
          reads first. */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={MINOR_ROADS} className="stroke-mauve-200" strokeWidth="1.5" />
        <path d={MAJOR_ROADS} className="stroke-mauve-300" strokeWidth="9" />
        <path d={MAJOR_ROADS} className="stroke-white" strokeWidth="6" />
      </g>

      {/* Every building footprint in the frame, then the DLW's on top */}
      <path
        d={FOOTPRINTS}
        className="fill-white stroke-mauve-300"
        strokeWidth="1"
      />
      <path
        d={DLW_FOOTPRINT}
        className="fill-rose-400 stroke-black"
        strokeWidth="2.5"
      />
      {/* paint-order:stroke turns each label's white stroke into a halo
          behind the glyphs — the standard cartographic trick that keeps text
          readable over footprints and parking aisles */}
      <g
        textAnchor="middle"
        fontSize="8"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="fill-mauve-500 stroke-white font-semibold [paint-order:stroke]"
      >
        {BUILDING_LABELS.map((l) => (
          <text key={l.text} x={l.x} y={l.y}>
            {l.text}
          </text>
        ))}
      </g>

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
      <g
        textAnchor="middle"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="stroke-white [paint-order:stroke]"
      >
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
      <g
        fontSize="9"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="fill-mauve-600 stroke-white font-bold [paint-order:stroke]"
      >
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
        strokeWidth="3"
        strokeLinejoin="round"
        className="font-display fill-black stroke-white font-extrabold [paint-order:stroke]"
      >
        N ↑
      </text>
      <text
        x="474"
        y="409"
        textAnchor="end"
        fontSize="6.5"
        strokeWidth="2"
        strokeLinejoin="round"
        className="fill-mauve-500 stroke-white [paint-order:stroke]"
      >
        Map data © OpenStreetMap
      </text>
    </svg>
  );
}
