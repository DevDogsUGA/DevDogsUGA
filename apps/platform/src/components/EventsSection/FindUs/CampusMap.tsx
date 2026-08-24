/**
 * The campus map, in a module of its own so the OSM path data behind it stays
 * out of the eager bundle: FindUsContent loads this with next/dynamic and
 * warms it on hover/focus/touch. Keep everything that imports campusMapData in
 * here, or that split quietly stops being one.
 */
import {
  FOOTPRINTS,
  HIGHLIGHT_PATHS,
  HIGHLIGHT_PINS,
  MAJOR_ROADS,
  MINOR_ROADS,
} from "./campusMapData";
import { VIEW, type BuildingKey } from "./campusMapMeta";
import { BUILDING_LABEL } from "./buildings";

/**
 * Label anchors placed by eye against the generated footprint coordinates
 * (each building's centroid is printed when the generator runs) — nudged off
 * roads and off each other, so re-check after regenerating campusMapData.
 *
 * The ten a meeting can name are labelled here like any other landmark. The
 * highlighted one is drawn again, bigger and in black, by {@link Callout} —
 * and skipped here, so it never prints twice at two sizes.
 */
const LABELS: { text: string; x: number; y: number; key?: BuildingKey }[] = [
  // ── North ──
  { text: "Main Library", x: 308, y: 30, key: "Main Library" },
  { text: "Journalism", x: 356, y: 86 },
  { text: "MLC", x: 253, y: 98, key: "MLC" },
  { text: "Memorial", x: 316, y: 118 },
  { text: "Bolton", x: 206, y: 118 },
  { text: "Tate Center", x: 275, y: 136, key: "Tate" },
  { text: "Tate Deck", x: 224, y: 152 },
  // ── Central / West ──
  { text: "Brumby", x: 74, y: 161 },
  { text: "Russell", x: 112, y: 150 },
  { text: "Creswell", x: 150, y: 150 },
  { text: "Sanford Stadium", x: 341, y: 168 },
  { text: "Physics", x: 240, y: 206 },
  { text: "O-House", x: 172, y: 276 },
  { text: "Conner", x: 312, y: 227 },
  // ── South ──
  { text: "Poultry Science", x: 300, y: 248, key: "Poultry Science" },
  { text: "Science Library", x: 264, y: 264, key: "Science Library" },
  { text: "Boyd", x: 288, y: 285, key: "Boyd" },
  { text: "Food Science", x: 355, y: 272 },
  { text: "Snelling", x: 232, y: 310 },
  { text: "Stegeman", x: 172, y: 384 },
  {
    text: "Science Learning Ctr",
    x: 234,
    y: 360,
    key: "Science Learning Center",
  },
  { text: "Plant Sciences", x: 258, y: 394, key: "Plant Sciences" },
  { text: "Aderhold", x: 336, y: 397 },
  { text: "Coverdell", x: 226, y: 421 },
  { text: "Driftmier", x: 273, y: 484, key: "Driftmier" },
];

interface Props {
  /** Which building to highlight. Everything else is drawn as context. */
  building: BuildingKey;
}

/**
 * Real geometry, not a sketch: road centerlines and building footprints come
 * from OpenStreetMap via scripts/generate-campus-map.ts, projected into the
 * viewBox. Labels are placed by eye against those generated coordinates —
 * after regenerating campusMapData, re-check them against the rendered map.
 *
 * The frame runs from the Main Library down to Driftmier, which is why it is
 * portrait rather than landscape: every building a meeting can name has to be
 * ON it, and that list spans 1.7 km of campus.
 */
export default function CampusMap({ building }: Props) {
  const pin = HIGHLIGHT_PINS[building];
  const footprint = HIGHLIGHT_PATHS[building];

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
          muted mauve throughout; black is reserved for the highlighted
          building, its pin, and the callout, so the one building that matters
          is the one that reads first. */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={MINOR_ROADS} className="stroke-mauve-200" strokeWidth="1.5" />
        <path d={MAJOR_ROADS} className="stroke-mauve-300" strokeWidth="9" />
        <path d={MAJOR_ROADS} className="stroke-white" strokeWidth="6" />
      </g>

      {/* Every footprint in the frame, then the highlighted one over the top.
          Every highlightable building is in FOOTPRINTS too, so the nine that
          are not the destination still draw as ordinary buildings rather than
          disappearing whenever the meeting is somewhere else. */}
      <path
        d={FOOTPRINTS}
        className="fill-white stroke-mauve-300"
        strokeWidth="1.3"
      />
      {footprint && (
        <path
          d={footprint}
          className="fill-rose-400 stroke-black"
          strokeWidth="2.5"
        />
      )}

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
        {LABELS.filter((l) => l.key !== building).map((l) => (
          <text key={l.text} x={l.x} y={l.y}>
            {l.text}
          </text>
        ))}
      </g>

      {pin && <Callout building={building} x={pin.x} y={pin.y} />}

      {/* Road labels, angled along their roads */}
      <g
        fontSize="9"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="fill-mauve-600 stroke-white font-bold [paint-order:stroke]"
      >
        <text x="86" y="92" transform="rotate(-12.5 86 92)">
          Baxter St
        </text>
        <text x="240" y="196" transform="rotate(-76 240 196)">
          S. Lumpkin St
        </text>
        <text x="104" y="300" transform="rotate(-67.5 104 300)">
          E. Cloverhurst Ave
        </text>
        <text x="182" y="246" fontSize="8" transform="rotate(23 182 246)">
          University Ct
        </text>
        <text x="252" y="332" fontSize="8" transform="rotate(-78 252 332)">
          Sanford Dr
        </text>
        <text x="316" y="452" fontSize="8" transform="rotate(-84 316 452)">
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
        x={VIEW.w - 6}
        y={VIEW.h - 6}
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

/**
 * The pin and the destination's name, at the one size on the map that is not
 * cartographic furniture.
 *
 * Placed relative to the pin rather than hand-positioned per building. The old
 * map could afford a hand-tuned callout with a leader line because there was
 * exactly one destination and it never moved; ten destinations means ten sets
 * of coordinates to keep true through every reframing, which is ten chances
 * for one of them to be quietly wrong. A rule that reads the generated pin
 * cannot drift from it.
 *
 * The name goes below the pin unless the pin is near the bottom edge, where
 * below would run off the map.
 */
function Callout({
  building,
  x,
  y,
}: {
  building: BuildingKey;
  x: number;
  y: number;
}) {
  const below = y < VIEW.h - 46;
  const labelY = below ? y + 30 : y - 24;

  return (
    <>
      {/* The teardrop: a disc with a triangle hanging off it, drawn from the
          pin's own coordinates so it lands on the footprint the generator
          measured rather than near it. */}
      <circle
        cx={x}
        cy={y - 10}
        r="7"
        className="fill-rose-600 stroke-black"
        strokeWidth="2"
      />
      <path
        d={`M ${x - 5.4} ${y - 6} L ${x + 5.4} ${y - 6} L ${x} ${y + 5} Z`}
        className="fill-rose-600"
      />
      <text
        x={x}
        y={labelY}
        textAnchor="middle"
        fontSize="13"
        strokeWidth="3"
        strokeLinejoin="round"
        className="font-display fill-black stroke-white font-extrabold [paint-order:stroke]"
      >
        {BUILDING_LABEL[building]}
      </text>
    </>
  );
}
