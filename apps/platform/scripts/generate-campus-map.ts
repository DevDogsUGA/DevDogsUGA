/**
 * Regenerates `src/components/EventsSection/campusMapData.ts` from live
 * OpenStreetMap data (run with `pnpm exec tsx scripts/generate-campus-map.ts`).
 *
 * The homepage's "Getting to the DLW" map is real geometry, not a sketch: road
 * centerlines and building footprints around the Dining, Learning and
 * Well-being Center, pulled via Overpass and projected equirectangular into an
 * SVG viewBox. Rerun this when OSM improves the area (the DLW footprint is
 * brand new) or when the map should frame a different spot; labels live in
 * FindUs.tsx and are placed against these coordinates, so eyeball the rendered
 * map after regenerating.
 *
 * OSM data is ODbL — the map must keep its visible "© OpenStreetMap"
 * attribution (FindUs.tsx renders it in the SVG corner).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Query bbox (S, W, N, E) — generous so route roads arrive whole. */
const QUERY_BBOX = [33.9425, -83.387, 33.9535, -83.369] as const;

/** Rendered frame: Brumby west, into Sanford Stadium east, Baxter north,
 * Snelling south — wide enough that the central/south-campus buildings CS
 * students actually walk from sit on the map. */
const S = 33.9441,
  N = 33.9525,
  W = -83.3832,
  E = -83.3715;
const VW = 480;

const ROAD_NAMES = [
  "Baxter Street",
  "South Lumpkin Street",
  "East Cloverhurst Avenue",
  "University Court",
  "Sanford Drive",
  "D. W. Brooks Drive",
  "Cedar Street",
];

const BUILDING_NAMES = [
  "Dining, Learning and Well-being Center",
  "Brumby Hall",
  "Russell Hall",
  "Creswell Hall",
  "Bolton Dining Commons",
  "Tate Student Center",
  "Tate Center Parking Deck",
  "Zell B. Miller Student Learning Center",
  "Oglethorpe House",
  "Oglethorpe Dining Commons",
  "Hill Hall",
  "Church Hall",
  "Boggs Hall",
  "Mell Hall",
  "Lipscomb Hall",
  "Boyd Graduate Research Center",
  "Shirley Mathis McBay Science Library",
  "Physics Building",
  "Snelling Dining Commons",
  "Geography and Geology Building",
  "Journalism Building",
  "Sanford Stadium",
];

/**
 * The walking route follows S. Lumpkin south from the Tate crossing, then
 * University Court west to the DLW. OSM splits Lumpkin into many ways; these
 * are the consecutive segments between Baxter and the University Ct junction,
 * north to south. If a rerun throws on a missing id, the ways were re-split
 * upstream — rebuild the list by following the printed way ids for
 * "South Lumpkin Street".
 */
const LUMPKIN_ROUTE_WAY_IDS = [
  1168366199, 1168366201, 1187633469, 1187633470, 1187633471, 914043318,
];
const UNIVERSITY_CT_WAY_ID = 9098736;

interface OsmGeomPoint {
  lat: number;
  lon: number;
}
interface OsmWay {
  id: number;
  tags?: Record<string, string>;
  geometry: OsmGeomPoint[];
}

const latMid = (S + N) / 2;
const kx = Math.cos((latMid * Math.PI) / 180);
const wDeg = (E - W) * kx;
const hDeg = N - S;
const VH = Math.round((VW * hDeg) / wDeg);

const px = (lon: number, lat: number): [number, number] => [
  (((lon - W) * kx) / wDeg) * VW,
  ((N - lat) / hDeg) * VH,
];
const fmt = (n: number) => Math.round(n * 10) / 10;

/** Drop points within 3px of the last kept one — subpixel wiggle isn't worth
 * the payload bytes at this scale. */
function simplify(pts: [number, number][]): [number, number][] {
  const kept = [pts[0]!];
  for (const p of pts.slice(1)) {
    const [lx, ly] = kept[kept.length - 1]!;
    if (Math.hypot(p[0] - lx, p[1] - ly) > 3) kept.push(p);
  }
  const last = pts[pts.length - 1]!;
  const tail = kept[kept.length - 1]!;
  if (tail[0] !== last[0] || tail[1] !== last[1]) kept.push(last);
  return kept;
}

const proj = (geom: OsmGeomPoint[]) =>
  geom.map((g) => px(g.lon, g.lat).map(fmt) as [number, number]);
const toPath = (geom: OsmGeomPoint[], close: boolean) =>
  "M" +
  simplify(proj(geom))
    .map((p) => p.join(" "))
    .join("L") +
  (close ? "Z" : "");

async function fetchOsm(): Promise<OsmWay[]> {
  const query = `[out:json][timeout:30];
(
  way["highway"~"primary|secondary|tertiary|residential|unclassified"](${QUERY_BBOX.join(",")});
  way["building"]["name"](${QUERY_BBOX.join(",")});
  way["leisure"="stadium"](${QUERY_BBOX.join(",")});
);
out geom tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Overpass 406s requests that don't identify themselves.
      "User-Agent": "devdogs-platform-campus-map (devdogsuga.org)",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const data = (await res.json()) as { elements: OsmWay[] };
  return data.elements;
}

const elements = await fetchOsm();

const roads: Record<string, string> = {};
for (const name of ROAD_NAMES) {
  const ways = elements.filter((e) => e.tags?.highway && e.tags.name === name);
  if (!ways.length) throw new Error(`no OSM ways found for road "${name}"`);
  // One path per road with each way a subpath; the viewBox clips overshoot.
  roads[name] = ways.map((w) => toPath(w.geometry, false)).join("");
}

const buildings = BUILDING_NAMES.map((name) => {
  // Sanford Stadium is tagged leisure=stadium rather than building.
  const b = elements.find(
    (e) =>
      (e.tags?.building ?? e.tags?.leisure === "stadium") &&
      e.tags?.name === name,
  );
  if (!b) throw new Error(`no OSM building found for "${name}"`);
  const c = b.geometry.reduce<[number, number]>(
    (a, g) => [a[0] + g.lon, a[1] + g.lat],
    [0, 0],
  );
  const [cx, cy] = px(c[0] / b.geometry.length, c[1] / b.geometry.length).map(
    fmt,
  );
  return { name, d: toPath(b.geometry, true), cx, cy };
});

const way = (id: number) => {
  const w = elements.find((e) => e.id === id);
  if (!w) throw new Error(`OSM way ${id} missing — see LUMPKIN_ROUTE_WAY_IDS`);
  return w.geometry;
};

const routePts: [number, number][] = [];
for (const id of LUMPKIN_ROUTE_WAY_IDS) routePts.push(...proj(way(id)));
// University Ct's way starts at the Lumpkin end; walk it west until beside
// the DLW (x < 161 puts the last point at the building's southeast corner).
const uc = proj(way(UNIVERSITY_CT_WAY_ID));
const stopIdx = uc.findIndex((p) => p[0] < 161);
routePts.push(...uc.slice(0, stopIdx + 1));
// The route starts on Lumpkin itself, at the crossing by the Tate bus stops —
// FindUs.tsx marks ROUTE_START with an origin dot rather than a lead-in stub
// (a stub would poke into the parking deck's footprint).
const simplified = simplify(routePts);
const route = "M" + simplified.map((p) => p.join(" ")).join("L");
const routeStart = simplified[0]!;
const routeEnd = simplified[simplified.length - 1]!;

const out = `// GENERATED by scripts/generate-campus-map.ts — do not edit by hand.
// Map data © OpenStreetMap contributors, ODbL — openstreetmap.org/copyright
// Frame: lat ${S}..${N}, lon ${W}..${E}, equirectangular, ${VW}x${VH}.

export const VIEW = { w: ${VW}, h: ${VH} };

export const ROADS: Record<string, string> = ${JSON.stringify(roads, null, 2)};

export interface BuildingShape {
  name: string;
  d: string;
  cx: number;
  cy: number;
}

export const BUILDINGS: BuildingShape[] = ${JSON.stringify(buildings, null, 2)};

export const ROUTE = ${JSON.stringify(route)};
export const ROUTE_START: [number, number] = ${JSON.stringify(routeStart)};
export const ROUTE_END: [number, number] = ${JSON.stringify(routeEnd)};
`;

const target = join(
  import.meta.dirname,
  "../src/components/EventsSection/campusMapData.ts",
);
writeFileSync(target, out);
console.log(`wrote ${target}`);
console.log(`viewBox 0 0 ${VW} ${VH} | route ends at ${routeEnd.join(",")}`);
for (const b of buildings) console.log(`  ${b.name} → ${b.cx},${b.cy}`);
