/**
 * Regenerates `src/components/EventsSection/campusMapData.ts` from live
 * OpenStreetMap data (run with `pnpm exec tsx scripts/generate-campus-map.ts`).
 *
 * The Directions dialog's campus map is real geometry, not a sketch: every
 * building footprint and road in the frame, pulled via Overpass and projected
 * equirectangular into an SVG viewBox. The DLW's own footprint is exported
 * separately so the component can highlight it, along with its centroid in
 * lat/lon — the pin the Google/Apple Maps links drop, since the building is
 * too new for a name search to resolve reliably. Rerun this when OSM improves
 * the area (the DLW is brand new) or to reframe; the landmark labels live in
 * FindUs.tsx and are placed by eye against these coordinates, so check the
 * rendered map after regenerating — the script prints each labeled building's
 * centroid to help.
 *
 * OSM data is ODbL — the map must keep its visible "© OpenStreetMap"
 * attribution (FindUs.tsx renders it in the SVG corner).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Query bbox (S, W, N, E) — generous so roads at the frame's edge arrive
 * whole instead of clipped mid-way. */
const QUERY_BBOX = [33.9425, -83.387, 33.9535, -83.369] as const;

/** Rendered frame: Brumby west, into Sanford Stadium east, Baxter north,
 * Snelling south — wide enough that the central/south-campus buildings CS
 * students actually walk from sit on the map. */
const S = 33.9441,
  N = 33.9525,
  W = -83.3832,
  E = -83.3715;
const VW = 480;

/** Roads drawn with full casing, vs. thin service/pedestrian connectors. */
const MAJOR_HIGHWAYS = new Set([
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
]);
const MINOR_HIGHWAYS = new Set(["service", "pedestrian"]);

/** OSM's name for the building the map highlights. */
const DLW_NAME = "Dining, Learning and Well-being Center";

/** Buildings FindUs.tsx labels — listed here only so the script prints their
 * centroids for placing those labels. */
const LABELED_BUILDINGS = [
  DLW_NAME,
  "Brumby Hall",
  "Russell Hall",
  "Creswell Hall",
  "Bolton Dining Commons",
  "Tate Student Center",
  "Tate Center Parking Deck",
  "Zell B. Miller Student Learning Center",
  "Oglethorpe House",
  "Boyd Graduate Research Center",
  "Shirley Mathis McBay Science Library",
  "Physics Building",
  "Snelling Dining Commons",
  "Journalism Building",
  "Sanford Stadium",
];

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

/** Drop points within 2.5px of the last kept one — subpixel wiggle isn't
 * worth the payload bytes at this scale. */
function simplify(pts: [number, number][]): [number, number][] {
  const kept = [pts[0]!];
  for (const p of pts.slice(1)) {
    const [lx, ly] = kept[kept.length - 1]!;
    if (Math.hypot(p[0] - lx, p[1] - ly) > 2.5) kept.push(p);
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

/** Entirely outside the frame (with slack for stroke width)? Skip it. */
function inFrame(geom: OsmGeomPoint[]): boolean {
  return geom.some((g) => {
    const [x, y] = px(g.lon, g.lat);
    return x > -8 && x < VW + 8 && y > -8 && y < VH + 8;
  });
}

/** Shoelace area in px² — used to drop sheds too small to read as buildings. */
function area(geom: OsmGeomPoint[]): number {
  const pts = proj(geom);
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j]![0] + pts[i]![0]) * (pts[j]![1] - pts[i]![1]);
  }
  return Math.abs(a / 2);
}

async function fetchOsm(): Promise<OsmWay[]> {
  const query = `[out:json][timeout:60];
(
  way["highway"~"${[...MAJOR_HIGHWAYS, ...MINOR_HIGHWAYS].join("|")}"](${QUERY_BBOX.join(",")});
  way["building"](${QUERY_BBOX.join(",")});
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

const roadPaths = { major: [] as string[], minor: [] as string[] };
for (const e of elements) {
  const hw = e.tags?.highway;
  if (!hw || !inFrame(e.geometry)) continue;
  // A pedestrian way tagged area=yes is a plaza polygon, not a path.
  if (e.tags?.area === "yes") continue;
  if (MAJOR_HIGHWAYS.has(hw)) roadPaths.major.push(toPath(e.geometry, false));
  else if (MINOR_HIGHWAYS.has(hw))
    roadPaths.minor.push(toPath(e.geometry, false));
}

/** Area-weighted polygon centroid in lat/lon — a vertex average would drift
 * toward whichever wall OSM mapped with the most nodes. */
function centroid(geom: OsmGeomPoint[]): { lat: number; lon: number } {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0, j = geom.length - 1; i < geom.length; j = i++) {
    const p = geom[j]!,
      q = geom[i]!;
    const f = p.lon * q.lat - q.lon * p.lat;
    a += f;
    cx += (p.lon + q.lon) * f;
    cy += (p.lat + q.lat) * f;
  }
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { lat: round(cy / (3 * a)), lon: round(cx / (3 * a)) };
}

let dlw = "";
let dlwCenter: { lat: number; lon: number } | undefined;
const footprints: string[] = [];
for (const e of elements) {
  // Sanford Stadium is tagged leisure=stadium rather than building.
  if (!(e.tags?.building ?? e.tags?.leisure === "stadium")) continue;
  if (!inFrame(e.geometry) || area(e.geometry) < 12) continue;
  if (e.tags?.name === DLW_NAME) {
    dlw = toPath(e.geometry, true);
    dlwCenter = centroid(e.geometry);
  } else footprints.push(toPath(e.geometry, true));
}
if (!dlw || !dlwCenter)
  throw new Error(`no OSM footprint found for "${DLW_NAME}"`);

const labeled = LABELED_BUILDINGS.map((name) => {
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
  return { name, cx, cy };
});

const out = `// GENERATED by scripts/generate-campus-map.ts — do not edit by hand.
// Map data © OpenStreetMap contributors, ODbL — openstreetmap.org/copyright
// Frame: lat ${S}..${N}, lon ${W}..${E}, equirectangular, ${VW}x${VH}.

export const VIEW = { w: ${VW}, h: ${VH} };

/** Cased streets, one subpath per OSM way. */
export const MAJOR_ROADS = ${JSON.stringify(roadPaths.major.join(""))};

/** Service drives and pedestrian connectors, drawn thin. */
export const MINOR_ROADS = ${JSON.stringify(roadPaths.minor.join(""))};

/** Every building footprint in the frame except the DLW's. */
export const FOOTPRINTS = ${JSON.stringify(footprints.join(""))};

/** The Dining, Learning and Well-being Center, highlighted by the map. */
export const DLW_FOOTPRINT = ${JSON.stringify(dlw)};

/** Centroid of that footprint — where the Google/Apple Maps links drop their pin. */
export const DLW_CENTER = ${JSON.stringify(dlwCenter)};
`;

const target = join(
  import.meta.dirname,
  "../src/components/EventsSection/campusMapData.ts",
);
writeFileSync(target, out);
console.log(`wrote ${target} (${(out.length / 1024).toFixed(1)}KB)`);
console.log(
  `viewBox 0 0 ${VW} ${VH} | ${roadPaths.major.length} major ways, ${roadPaths.minor.length} minor ways, ${footprints.length + 1} footprints`,
);
for (const b of labeled) console.log(`  ${b.name} → ${b.cx},${b.cy}`);
console.log(`DLW centroid ${dlwCenter.lat},${dlwCenter.lon}`);
