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
  ROAD_LABELS,
} from "./campusMapData";
import { VIEW, type BuildingKey } from "./campusMapMeta";
import { BUILDING_LABEL } from "./buildings";

/**
 * The two plates the map is drawn on.
 *
 * The dark plate is a night map, not the light map with the values flipped,
 * and each layer gets its own HUE, because on a dark ground lightness alone
 * does not separate them — a first draft in one slate ramp had roads and
 * buildings reading as the same grey. So: near-black navy ground; buildings
 * as cool grey blocks; roads as warm yellow ribbons, the way night
 * navigation maps draw them, with a casing the colour of the ground so a
 * ribbon has an edge where it crosses a building; street names in the road
 * colour and building names in white, each haloed in the ground colour.
 * Five layers, five colours, none of them the rose of the destination or the
 * cyan of its pin.
 *
 * The rose footprint and the cyan pin are the answer and keep their hue on
 * both plates; only their outlines change, black on the light ground and
 * white on the dark one, because an outline is there to separate the shape
 * from what it sits on.
 */
const MAP_TONES = {
  light: {
    frame: "border-2 border-black",
    land: "fill-orange-50",
    minorRoad: "stroke-mauve-200",
    majorCasing: "stroke-mauve-300",
    majorSurface: "stroke-white",
    footprint: "fill-white stroke-mauve-300",
    highlight: "fill-rose-400 stroke-black",
    pin: "fill-cyan-500 stroke-black",
    pinDot: "fill-black",
    label: "fill-mauve-700 stroke-white",
    roadLabel: "fill-mauve-400 stroke-white",
    compass: "fill-black stroke-white",
    credit: "fill-mauve-500 stroke-white",
    callout: "fill-black stroke-white",
  },
  dark: {
    frame: "border border-slate-600",
    land: "fill-slate-950",
    minorRoad: "stroke-amber-200/35",
    majorCasing: "stroke-slate-950",
    majorSurface: "stroke-amber-200/70",
    footprint: "fill-slate-700 stroke-slate-500",
    highlight: "fill-rose-400 stroke-white",
    pin: "fill-cyan-400 stroke-white",
    pinDot: "fill-slate-950",
    label: "fill-white stroke-slate-950",
    roadLabel: "fill-amber-100 stroke-slate-950",
    compass: "fill-white stroke-slate-950",
    credit: "fill-slate-400 stroke-slate-950",
    callout: "fill-white stroke-slate-950",
  },
} as const;

export type MapTone = keyof typeof MAP_TONES;

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
  { text: "Russell", x: 110, y: 152 },
  { text: "Creswell", x: 152, y: 140 },
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
  /** The plate the map sits on; see MAP_TONES. */
  tone?: MapTone;
}

type Pin = (typeof HIGHLIGHT_PINS)[string];
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Roughly where a label's glyphs land.
 *
 * Estimated from the character count rather than measured, because measuring
 * means getBBox, and getBBox means this drawing can only be laid out in a
 * browser after it has already been painted wrong once. The widest character
 * on the map runs about 0.74em and the narrowest about 0.41em; 0.62 is set
 * high on purpose, since the cost of over-estimating is dropping a landmark
 * name that would have just fitted, and the cost of under-estimating is the
 * collision this exists to prevent.
 */
function labelBox(text: string, x: number, y: number, size: number): Box {
  const w = text.length * size * 0.62;
  return {
    x0: x - w / 2,
    x1: x + w / 2,
    // Tall enough to count a name on the line above as being in the way: the
    // two sets of glyphs miss each other by a pixel, but each is painted with
    // a halo half that wide again, so they arrive as one smudge.
    y0: y - size * 0.92,
    y1: y + size * 0.3,
  };
}

/** The same, for text turned along a road: the upright box around it. */
function rotatedBox(
  text: string,
  x: number,
  y: number,
  size: number,
  angle: number,
): Box {
  const w = text.length * size * 0.62;
  const cos = Math.abs(Math.cos((angle * Math.PI) / 180));
  const sin = Math.abs(Math.sin((angle * Math.PI) / 180));
  const [bw, bh] = [w * cos + size * sin, w * sin + size * cos];
  return { x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 };
}

const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

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
export default function CampusMap({ building, tone = "light" }: Props) {
  const pin = HIGHLIGHT_PINS[building];
  const footprint = HIGHLIGHT_PATHS[building];

  /**
   * What the callout occupies, and so what has to get out of its way.
   *
   * Ten destinations means ten arrangements of this map, and the dense corner
   * of it — Boyd, the Science Library, Poultry Science and Food Science within
   * 40px of each other — cannot be hand-placed to survive all ten. Whichever
   * building is being pointed at wins; a context label the callout lands on is
   * dropped for that one rendering rather than printed underneath it.
   */
  const placed = pin === undefined ? undefined : placeCallout(pin);
  const claimed: Box[] =
    pin === undefined || placed === undefined
      ? []
      : [
          labelBox(BUILDING_LABEL[building], pin.x, placed.labelY, 13),
          {
            x0: pin.x - PIN_R - 1,
            x1: pin.x + PIN_R + 1,
            y0: Math.min(placed.tipY, placed.cy - PIN_R),
            y1: Math.max(placed.tipY, placed.cy + PIN_R),
          },
        ];
  const clear = (box: Box) => !claimed.some((c) => overlaps(c, box));
  const m = MAP_TONES[tone];

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      className={`w-full rounded-sm ${m.frame}`}
    >
      <rect width={VIEW.w} height={VIEW.h} className={m.land} />

      {/* Roads: minor drives first and thin, then the cased streets — each
          tier's casing before its white surface, so surfaces run together at
          junctions instead of butting into casings. The base map is drawn in
          muted mauve throughout; black is reserved for the highlighted
          building, its pin, and the callout, so the one building that matters
          is the one that reads first. */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={MINOR_ROADS} className={m.minorRoad} strokeWidth="1.5" />
        <path d={MAJOR_ROADS} className={m.majorCasing} strokeWidth="9" />
        <path d={MAJOR_ROADS} className={m.majorSurface} strokeWidth="6" />
      </g>

      {/* Every footprint in the frame, then the highlighted one over the top.
          Every highlightable building is in FOOTPRINTS too, so the nine that
          are not the destination still draw as ordinary buildings rather than
          disappearing whenever the meeting is somewhere else. */}
      <path d={FOOTPRINTS} className={m.footprint} strokeWidth="1.3" />
      {footprint && (
        <path d={footprint} className={m.highlight} strokeWidth="2.5" />
      )}

      {/* Building names, and the loudest thing on the map after the
          destination itself — somebody reading this is looking for a
          building, so the streets are what they scan past.

          paint-order:stroke turns each label's white stroke into a halo
          behind the glyphs — the standard cartographic trick that keeps text
          readable over footprints and parking aisles. */}
      <g
        textAnchor="middle"
        fontSize="9"
        strokeWidth="3"
        strokeLinejoin="round"
        className={`font-semibold [paint-order:stroke] ${m.label}`}
      >
        {LABELS.filter(
          (l) => l.key !== building && clear(labelBox(l.text, l.x, l.y, 9)),
        ).map((l) => (
          <text key={l.text} x={l.x} y={l.y}>
            {l.text}
          </text>
        ))}
      </g>

      {pin && (
        <Callout
          building={building}
          pin={pin}
          className={m.callout}
          pinClassName={m.pin}
          pinDotClassName={m.pinDot}
        />
      )}

      {/* Street names, sitting on their own centrelines at their own angle:
          position and rotation are generated from the road geometry, not
          typed here, because the six that were typed here were placed against
          a landscape frame and every one of them was left behind when the map
          went portrait.

          Smaller and paler than the building names on purpose. A street name
          is orientation — it should be there when looked for and quiet when
          not, and it is competing with the labels that actually answer the
          question. */}
      <g
        fontSize="7"
        strokeWidth="2.5"
        strokeLinejoin="round"
        textAnchor="middle"
        dominantBaseline="central"
        className={`font-semibold [paint-order:stroke] ${m.roadLabel}`}
      >
        {ROAD_LABELS.filter((r) =>
          clear(rotatedBox(r.text, r.x, r.y, 7, r.angle)),
        ).map((r) => (
          <text
            key={r.text}
            x={r.x}
            y={r.y}
            transform={`rotate(${r.angle} ${r.x} ${r.y})`}
          >
            {r.text}
          </text>
        ))}
      </g>

      {/* Compass + the ODbL attribution OSM data requires */}
      <text
        x="24"
        y="40"
        textAnchor="middle"
        fontSize="13"
        strokeWidth="3"
        strokeLinejoin="round"
        className={`font-display font-extrabold [paint-order:stroke] ${m.compass}`}
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
        className={`[paint-order:stroke] ${m.credit}`}
      >
        Map data © OpenStreetMap
      </text>
    </svg>
  );
}

/** Tip to crown, and the radius of the balloon on top of it. */
const PIN_H = 22;
const PIN_R = 7;

/**
 * The pin and the destination's name, at the one size on the map that is not
 * cartographic furniture.
 *
 * Placed relative to the footprint rather than hand-positioned per building.
 * The old map could afford a hand-tuned callout with a leader line because
 * there was exactly one destination and it never moved; ten destinations means
 * ten sets of coordinates to keep true through every reframing, which is ten
 * chances for one of them to be quietly wrong. A rule that reads the generated
 * footprint cannot drift from it.
 *
 * The pin stands OFF the building, tip on its edge, rather than on its
 * centroid. A campus building at this scale is 15-20px tall and the marker is
 * 22px, so a centred pin hid most of what it was pointing at — worst on the
 * DLW, which is both the smallest of the ten and the one people actually need
 * to find. It hangs above the building where there is room above, below it
 * where there is not.
 *
 * The name then goes on the far side of the building from the pin, so the two
 * frame the destination instead of stacking on one edge of it.
 */
function placeCallout({ top, bottom, tipTop, tipBottom }: Pin) {
  const above = top - PIN_H >= 10;
  // Which way the tip points, as a sign on y.
  const d = above ? 1 : -1;
  // Two pixels INSIDE the outline, not resting against it. The footprint's own
  // stroke is 2.5px wide and the pin's is 2, so a tip parked exactly on the
  // edge leaves the two strokes butting against each other with a pale seam
  // between them, and reads as a marker hovering over the building rather than
  // planted on it.
  const tipY = above ? tipTop + 2 : tipBottom - 2;
  const cy = tipY - d * (PIN_H - PIN_R);
  // Clamped rather than flipped back over the pin: a building at the very top
  // of the frame has nowhere above it to put a name, and pushing the name to
  // the pin's side instead stacks the two and shoves the name into whatever
  // landmark is there — which is what Main Library did to Journalism.
  const labelY = Math.min(
    Math.max(above ? bottom + 15 : top - 11, 14),
    VIEW.h - 8,
  );
  return { d, tipY, cy, labelY };
}

function Callout({
  building,
  pin,
  className,
  pinClassName,
  pinDotClassName,
}: {
  building: BuildingKey;
  pin: Pin;
  /** The name's fill and halo, from the plate's tone. */
  className: string;
  /** The teardrop's fill and outline, and the dot in it — same source. */
  pinClassName: string;
  pinDotClassName: string;
}) {
  const { x } = pin;
  const { d, tipY, cy, labelY } = placeCallout(pin);
  const reach = PIN_H - PIN_R;

  // The teardrop as one closed path: the major arc of the disc, then the two
  // lines that run from where the disc's tangents leave it down to the tip.
  // Drawn in one piece because a disc plus a separate triangle has to be a
  // filled triangle over a stroked disc, which puts a seam across the pin.
  const spread = Math.acos(PIN_R / reach);
  const aim = (d * Math.PI) / 2;
  const rim = (t: number) =>
    `${(x + PIN_R * Math.cos(t)).toFixed(2)} ${(cy + PIN_R * Math.sin(t)).toFixed(2)}`;
  const teardrop =
    `M ${rim(aim - spread)} ` +
    `A ${PIN_R} ${PIN_R} 0 1 0 ${rim(aim + spread)} ` +
    `L ${x} ${tipY} Z`;

  return (
    <>
      {/* The teardrop: a disc with a triangle hanging off it, drawn from the
          footprint's own edge so it lands on the building the generator
          measured rather than near it.

          Cyan against the rose footprint, which is the pairing the rest of
          the site uses. It was rose-600 on rose-400 — one step apart on one
          ramp, so the marker and the building it marks were the same colour
          at a glance, which is the one distinction this drawing exists to
          make. */}
      <path
        d={teardrop}
        className={pinClassName}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx={x} cy={cy} r="2.4" className={pinDotClassName} />
      <text
        x={x}
        y={labelY}
        textAnchor="middle"
        fontSize="13"
        strokeWidth="3"
        strokeLinejoin="round"
        className={`font-display font-extrabold [paint-order:stroke] ${className}`}
      >
        {BUILDING_LABEL[building]}
      </text>
    </>
  );
}
